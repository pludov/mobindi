#include <iostream>
#include <vector>
#include <unistd.h>
#include <fcntl.h>
#include <cstdint>
#include <stdio.h>
#include <sys/uio.h>

#include <mutex>
#include <condition_variable>
#include <chrono>

#include <zlib.h>
#include <stdio.h>

#include <baseclient.h>
#include <indiproperty.h>

#include "json.hpp"
#include "SharedCache.h"
#include "SharedCacheServer.h"
#include "RawDataStorage.h"
#include "FitsFile.h"

using namespace std;

using nlohmann::json;

static std::mutex nextEntryMutex;
static std::condition_variable nextEntryCond;

struct FrameContext {
    double maxWidth = 0, maxHeight = 0;
    double X = 0, Y = 0;
    double W = 0, H = 0;
    double hbin = 1, vbin = 1;
};

// This is protected under nextEntryMutex
static bool nextEntryDone = false;
static void * nextEntryData = nullptr;
static size_t nextEntrySize = 0;
static std::string nextEntryFormat;
static FrameContext nextEntryFrame;

static FrameContext indiFrame;

static uint64_t blobsize = 0;

class MyClient : public INDI::BaseClient
{
    std::string dev, prop;
 public:
    MyClient(const std::string & dev, const std::string & prop) : dev(dev), prop(prop) {}
    virtual ~MyClient() {}
protected:
    virtual void newDevice(INDI::BaseDevice *dp) {
        std::cerr << "new device\n";
    }
    virtual void removeDevice(INDI::BaseDevice *dp) {
        std::cerr << "remove device\n";
    }
    virtual void newProperty(INDI::Property *property) {
        // std::cerr << "new property\n";
        if (dev == property->getDeviceName() && prop == property->getName()) {
            setBLOBMode(BLOBHandling::B_ALSO, dev.c_str(), prop.c_str());
#ifdef INDI_SHARED_BLOB_SUPPORT
            enableDirectBlobAccess(dev.c_str(), prop.c_str());
#endif
        }

        if (property->getNumber()) {
            this->newNumber(property->getNumber());
        }
    };
    virtual void removeProperty(INDI::Property *property) {
        // std::cerr << "remove property\n";
    }
    virtual void newBLOB(IBLOB *bp) {
        std::cerr << "new blob: " << bp->format << "\n";

        nextEntryMutex.lock();

        // Don't leak dropped frames
        if (nextEntryDone) {
            fprintf(stderr, "dropping blob\n");
#ifdef INDI_SHARED_BLOB_SUPPORT
            IDSharedBlobFree(nextEntryData);
#else
            free(nextEntryData);
#endif
        }

        nextEntryFormat = bp->format;
        nextEntryData = bp->blob;
        nextEntrySize = bp->bloblen;
        // Free from INDI POV
        bp->blob=nullptr;
        bp->bloblen = 0;
        nextEntryFrame = indiFrame;
        nextEntryDone = true;

        nextEntryCond.notify_all();
        nextEntryMutex.unlock();
    }

    virtual void newSwitch(ISwitchVectorProperty *svp) {
        // std::cerr << "new switch\n";
    }

    virtual void newNumber(INumberVectorProperty *nvp) {
        // std::cerr << "new number " << nvp->name << "\n";
        if (!strcmp(nvp->name, "CCD_INFO")) {
            indiFrame.maxWidth = -1;
            indiFrame.maxHeight = -1;

            for(int i = 0; i < nvp->nnp; ++i) {
                auto prop = nvp->np+i;
                if (!strcmp(prop->name, "CCD_MAX_X")) {
                    indiFrame.maxWidth = prop->value;
                }
                if (!strcmp(prop->name, "CCD_MAX_Y")) {
                    indiFrame.maxHeight = prop->value;
                }
            }
            std::cerr << "got ccd info " << indiFrame.maxWidth << "x" << indiFrame.maxHeight << "\n";
        }
        if (!strcmp(nvp->name,"CCD_FRAME")) {
            for(int i = 0; i < nvp->nnp; ++i) {
                auto prop = nvp->np+i;
                if (!strcmp(prop->name, "X")) {
                    indiFrame.X = prop->value;
                }
                if (!strcmp(prop->name, "Y")) {
                    indiFrame.Y = prop->value;
                }
                if (!strcmp(prop->name, "WIDTH")) {
                    indiFrame.W = prop->value;
                }
                if (!strcmp(prop->name, "HEIGHT")) {
                    indiFrame.H = prop->value;
                }
            }
            std::cerr << "got ccd frame " << indiFrame.W << "x" << indiFrame.H << "@("<< indiFrame.X << "," << indiFrame.Y << ")\n";
        }
        if (!strcmp(nvp->name,"CCD_BINNING")) {
            indiFrame.vbin = 1;
            indiFrame.hbin = 1;
            for(int i = 0; i < nvp->nnp; ++i) {
                auto prop = nvp->np+i;
                if (!strcmp(prop->name, "HOR_BIN")) {
                    indiFrame.hbin = prop->value;
                    if (indiFrame.hbin < 1) {
                        indiFrame.hbin = 1;
                    }
                }
                if (!strcmp(prop->name, "VER_BIN")) {
                    indiFrame.vbin = prop->value;
                    if (indiFrame.vbin < 1) {
                        indiFrame.vbin = 1;
                    }
                }
            }
            std::cerr << "got ccd bin " << indiFrame.hbin << "x" << indiFrame.vbin << "\n";
        }
    }

    virtual void newMessage(INDI::BaseDevice *dp, int messageID) {
        // std::cerr << "new message\n";
    }
    virtual void newText(ITextVectorProperty *tvp) {
        // std::cerr << "new text\n";
    }
    virtual void newLight(ILightVectorProperty *lvp) {
        // std::cerr << "new light\n";
    }
    virtual void serverConnected() {
        std::cerr << "server connected\n";
    }
    virtual void serverDisconnected(int exit_code) {
        std::cerr << "server disconnected\n";
    }
private:
   INDI::BaseDevice * ccd_simulator;
};

static int pipesize = -1;

static void outputJson(const nlohmann::json & j) {
    std::string t = j.dump() + "\n";
    ssize_t tsize = t.size();
    ssize_t size = pipesize <= 0 ? (tsize + 1) : (tsize > (unsigned)pipesize ? tsize : pipesize + 1);
    char * buff = (char*)malloc(size);
    if (!buff) {
        perror("malloc");
        _exit(1);
    }
    memcpy(buff, t.data(), tsize);
    for(ssize_t i = tsize; i < size; ++i) {
        buff[i] = '\n';
    }

    auto wrRet = write(1, buff, size);
    if (wrRet == -1) {
        perror("write");
        _exit(1);
    }

    if (wrRet != size) {
        _exit(1);
    }

    free(buff);
}


int main (int argc, char ** argv) {
    if (argc != 5) {
        std::cerr << "Usage: " << argv[0] << " indi_host indi_port device property\n";
        return 1;
    }
	SharedCache::Cache * cache = new SharedCache::Cache();


    std::string streamId;

    pipesize = fcntl(1, F_SETPIPE_SZ, &pipesize);
    
    MyClient * client = new MyClient(argv[3], argv[4]);
    client->setServer("localhost"/*argv[1]*/, atoi(argv[2]));
    client->watchDevice(argv[3]);
    if (!client->connectServer()) {
        fprintf(stderr, "unable to connect to indi\n");
        return 1;
    }

    bool first = true;

    while(true) {
        SharedCache::Entry * nextEntry;
        nextEntry = cache->startStreamImage();
        if (first || nextEntry->getStreamId() != streamId) {
            first = false;
            streamId = nextEntry->getStreamId();
            auto j = nlohmann::json::object();
            j["streamId"] = streamId;
            outputJson(j);
        }

        std::string format;
        void * data;
        size_t size;
        do {
            {
                std::unique_lock<std::mutex> lock(nextEntryMutex);

                while(!nextEntryDone) {
                    nextEntryCond.wait_for(lock,  std::chrono::milliseconds(100));
                }
                data = nextEntryData;
                size = nextEntrySize;
                format = nextEntryFormat;

                nextEntryDone = false;
                nextEntryData = nullptr;
                nextEntryFormat = "";
                nextEntrySize = 0;
            }

            if (format != ".fits") {
                std::cerr << "ignoring unsupported blob type: " << format << "\n";
#ifdef INDI_SHARED_BLOB_SUPPORT
                IDSharedBlobFree(data);
#else
                free(data);
#endif
                continue;
            }
        } while(format != ".fits");


        SharedCache::WorkerError * nextEntryError = nullptr;

        FitsFile file;
        file.openMemory(data, size);
        try {
            SharedCache::Messages::RawContent::readFits(file, nextEntry);
        } catch(const SharedCache::WorkerError & error) {
            nextEntryError = new SharedCache::WorkerError(error);
        }

        if (nextEntryError != nullptr) {
            fprintf(stderr, "stream error");
            return 1;
        }
#ifdef INDI_SHARED_BLOB_SUPPORT
        IDSharedBlobFree(data);
#else
        free(data);
#endif

        RawDataStorage * storage = (RawDataStorage*)nextEntry->data();
        int w = storage->w;
        int h = storage->h;
        bool color = storage->hasColors();
        storage = nullptr;

        SharedCache::Messages::StreamPublishResult res = nextEntry->streamPublish();
        delete nextEntry;
        nextEntry = nullptr;

        auto streamDetails = nlohmann::json::object();
        streamDetails["width"] = w;
        streamDetails["height"] = h;
        streamDetails["colors"] = color;

        auto j = nlohmann::json::object();
        j["serial"] = res.serial;
        j["streamDetails"] = streamDetails;
        if (nextEntryFrame.maxHeight > 0 && nextEntryFrame.maxWidth > 0) {
            if (nextEntryFrame.W > 0 && nextEntryFrame.H > 0) {
                auto window = nlohmann::json::object();
                window["x"] = floor(nextEntryFrame.X / nextEntryFrame.hbin);
                window["y"] = floor(nextEntryFrame.Y / nextEntryFrame.vbin);
                window["w"] = ceil(nextEntryFrame.W / nextEntryFrame.hbin);
                window["h"] = ceil(nextEntryFrame.H / nextEntryFrame.vbin);
                window["maxW"] = ceil(nextEntryFrame.maxWidth / nextEntryFrame.hbin);
                window["maxH"] = ceil(nextEntryFrame.maxHeight / nextEntryFrame.vbin);
                j["subframe"] = window;
            }
        }

        outputJson(j);
     }
}
