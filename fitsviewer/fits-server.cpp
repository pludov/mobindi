#include <iostream>
#include <vector>
#include <unistd.h>
#include <cstdint>
#include <stdio.h>
#include <sys/uio.h>

#include <zlib.h>
#include <stdio.h>

#include "SharedCacheServer.h"

int main (int argc, char ** argv) {
    if (argc != 3) {
        fprintf(stderr, "Wrong number of arguments\n");
        return 1;
    }
    auto size = atoll(argv[2]);
    if (size < 65536) {
        fprintf(stderr, "Invalid cache size\n");
        return 1;
    }
	auto instance = new SharedCache::SharedCacheServer(argv[1], atoll(argv[2]));
    instance->init();
    return 0;
}

