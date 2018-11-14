#include <iostream>
#include <vector>
#include <unistd.h>
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
    json request;
    std::cin >> request;

	// 128Mo cache
	SharedCache::Cache * cache = new SharedCache::Cache("/tmp/fitsviewer.cache", 128*1024*1024);


	SharedCache::Messages::ContentRequest contentRequest;
    SharedCache::Messages::JsonQuery jsonQuery = request;
    contentRequest.jsonQuery = new SharedCache::Messages::JsonQuery(jsonQuery);


	SharedCache::EntryRef result(cache->getEntry(contentRequest));
	if (result->hasError()) {
		cerr << result->getErrorDetails();
		exit(1);
	}
    write(1, result->data(), result->size());
    result->release();
    return 0;
}
