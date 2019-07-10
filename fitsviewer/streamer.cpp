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

#include "json.hpp"
#include "SharedCache.h"
#include "SharedCacheServer.h"
#include "RawDataStorage.h"
#include "FitsFile.h"

using namespace std;

using nlohmann::json;

static std::mutex nextEntryMutex;
static std::condition_variable nextEntryCond;

// This is protected under nextEntryMutex
static bool nextEntryDone;
static SharedCache::Entry * nextEntry;
static SharedCache::WorkerError * nextEntryError;

class MyClient : public INDI::BaseClient
{
 public:
    MyClient() {}
    virtual ~MyClient() {}
protected:
    virtual void newDevice(INDI::BaseDevice *dp) {
        std::cerr << "new device\n";
    }
    virtual void removeDevice(INDI::BaseDevice *dp) {
        std::cerr << "remove device\n";
    }
    virtual void newProperty(INDI::Property *property) {
        std::cerr << "new property\n";
    };
    virtual void removeProperty(INDI::Property *property) {
        std::cerr << "remove property\n";
    }
    virtual void newBLOB(IBLOB *bp) {
        std::cerr << "new blob: " << bp->format << "\n";
        if (strcmp(bp->format, ".fits")) {
            std::cerr << "ignoring unsupported blob type: " << bp->format << "\n";
            return;
        }

        nextEntryMutex.lock();
        nextEntryDone = true;
        FitsFile file;
        file.openMemory(bp->blob, bp->bloblen);
        try {
            SharedCache::Messages::RawContent::readFits(file, nextEntry);
        } catch(const SharedCache::WorkerError & error) {
            nextEntryError = new SharedCache::WorkerError(error);
        }

        nextEntryCond.notify_all();
        nextEntryMutex.unlock();
    }

    virtual void newSwitch(ISwitchVectorProperty *svp) {
        std::cerr << "new switch\n";
    }
    virtual void newNumber(INumberVectorProperty *nvp) {
        std::cerr << "new number\n";
    }
    virtual void newMessage(INDI::BaseDevice *dp, int messageID) {
        std::cerr << "new message\n";
    }
    virtual void newText(ITextVectorProperty *tvp) {
        std::cerr << "new text\n";
    }
    virtual void newLight(ILightVectorProperty *lvp) {
        std::cerr << "new light\n";
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
    auto tsize = t.size();
    auto size = pipesize <= 0 ? (tsize + 1) : (tsize > (unsigned)pipesize ? tsize : pipesize + 1);
    char * buff = (char*)malloc(size);
    if (!buff) {
        perror("malloc");
        _exit(1);
    }
    memcpy(buff, t.data(), tsize);
    for(auto i = tsize; i < size; ++i) {
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
	// 128Mo cache
	SharedCache::Cache * cache = new SharedCache::Cache("/tmp/fitsviewer.cache", 128*1024*1024);


    std::unique_lock<std::mutex> lock(nextEntryMutex);
    std::string streamId;

    pipesize = fcntl(1, F_SETPIPE_SZ, &pipesize);
    
    MyClient * client = new MyClient();
    client->setServer("127.0.0.1",7624);
    client->watchDevice("Will never exists");
    client->connectServer();
    client->setBLOBMode(BLOBHandling::B_ONLY, "CCD Simulator", "CCD1");

    bool first = true;

    while(true) {
        nextEntry = cache->startStreamImage();
        if (nextEntryError != nullptr) {
            delete nextEntryError;
            nextEntryError = nullptr;
        }
        if (first || nextEntry->getStreamId() != streamId) {
            first = false;
            streamId = nextEntry->getStreamId();
            auto j = nlohmann::json::object();
            j["streamId"] = streamId;
            outputJson(j);
        }

        nextEntryDone = false;

        while(!nextEntryDone) {
            nextEntryCond.wait_for(lock,  std::chrono::milliseconds(100));
        }

        if (nextEntryError != nullptr) {
            fprintf(stderr, "stream error");
            return 1;
        }
        RawDataStorage * storage = (RawDataStorage*)nextEntry->data();
        int w = storage->w;
        int h = storage->h;
        storage = nullptr;

        SharedCache::Messages::StreamPublishResult res = nextEntry->streamPublish();
        delete nextEntry;
        nextEntry = nullptr;

        auto streamSize = nlohmann::json::object();
        streamSize["width"] = w;
        streamSize["height"] = h;

        auto j = nlohmann::json::object();
        j["serial"] = res.serial;
        j["streamSize"] = streamSize;
        outputJson(j);
     }
}
