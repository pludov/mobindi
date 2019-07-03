#include <iostream>
#include <vector>
#include <unistd.h>
#include <fcntl.h>
#include <cstdint>
#include <stdio.h>
#include <sys/uio.h>

#include <zlib.h>
#include <stdio.h>

#include "json.hpp"
#include "SharedCache.h"
#include "RawDataStorage.h"

using namespace std;

using nlohmann::json;


int main (int argc, char ** argv) {
	// 128Mo cache
	SharedCache::Cache * cache = new SharedCache::Cache("/tmp/fitsviewer.cache", 128*1024*1024);

    int pipesize = 1;
    pipesize = fcntl(1, F_SETPIPE_SZ, &pipesize);
    
    int w = 640;
    int h = 480;

    while(true) {
        SharedCache::Entry * entry = cache->startStreamImage();

        entry->allocate(RawDataStorage::requiredStorage(w, h));
    	RawDataStorage * storage = (RawDataStorage*)entry->data();
        storage->w = w;
        storage->h = h;
        storage->bayer[0] = 0;
        storage->bayer[1] = 0;
        storage->bayer[2] = 0;
        storage->bayer[3] = 0;
        
        for(int y = 0; y < h; ++y)
            for(int x = 0; x < w; ++x)
                storage->setAdu(x, y, rand()% 65535);
        sleep(1);

        SharedCache::Messages::StreamPublishResult res = entry->streamPublish();
        delete entry;

        json j = res;

        std::string t = j.dump() + "\n";
        auto tsize = t.size();
        auto size = pipesize <= 0 ? (tsize + 1) : (tsize > (unsigned)pipesize ? tsize : pipesize + 1);
        char * buff = (char*)malloc(size);
        if (!buff) {
            perror("malloc");
            return 1;
        }
        memcpy(buff, t.data(), tsize);
        for(auto i = tsize; i < size; ++i) {
            buff[i] = '\n';
        }
        
        write(1, buff, size);
        free(buff);
    }

    return 0;
}
