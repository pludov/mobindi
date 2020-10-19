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
    json rawRequest;
	json options;
    std::cin >> rawRequest;

	if (rawRequest.contains("options")) {
		options = rawRequest["options"];
		rawRequest.erase("options");
	} else {
		options = nullptr;
	}

	SharedCache::Messages::ContentRequest contentRequest = rawRequest;

	// 128Mo cache
	SharedCache::Cache * cache = new SharedCache::Cache("/tmp/fitsviewer.cache", 128*1024*1024);


	SharedCache::EntryRef result(cache->getEntry(contentRequest));
	if (result->hasError()) {
		cerr << result->getErrorDetails();
		exit(1);
	}
	json prettyResult;
	if (((argc == 2) && (!strcmp(argv[1], "-r"))) || !contentRequest.asJsonResult(result, prettyResult, options)) {
		write(1, result->data(), result->size());
	} else {
		std::string t = prettyResult.dump();
		if (t.length()) {
			write(1, t.data(), t.length());
		}
	}
	result->release();
	return 0;
}
