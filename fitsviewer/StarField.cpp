#include <iostream>
#include <vector>
#include <unistd.h>
#include <cstdint>
#include <stdio.h>
#include <sys/uio.h>

#include <zlib.h>
#include <stdio.h>

#include "json.hpp"
#include "fitsio.h"
#include "SharedCache.h"
#include "SharedCacheServer.h"
#include "RawDataStorage.h"
#include "HistogramStorage.h"
#include "LookupTable.h"
#include "BitMask.h"
#include "ChannelMode.h"
#include "MultiStarFinder.h"

using namespace std;

using nlohmann::json;

void SharedCache::Messages::StarField::produce(SharedCache::Entry* entry)
{
	SharedCache::Messages::ContentRequest contentRequest;
	contentRequest.fitsContent = new SharedCache::Messages::RawContent(source);
	SharedCache::EntryRef aduPlane(entry->getServer()->getEntry(contentRequest));
	if (aduPlane->hasError()) {
        aduPlane->release();
		throw WorkerError(std::string("Source error : ") + aduPlane->getErrorDetails());
	}
	RawDataStorage * contentStorage = (RawDataStorage *)aduPlane->data();

	SharedCache::Messages::ContentRequest histogramRequest;
	histogramRequest.histogram = new SharedCache::Messages::Histogram();
	histogramRequest.histogram->source = SharedCache::Messages::RawContent(source);
	SharedCache::EntryRef histogram(entry->getServer()->getEntry(histogramRequest));
    if (histogram->hasError()) {
        histogram->release();
        aduPlane->release();
        throw WorkerError(std::string("Source error : ") + histogram->getErrorDetails());
    }

	HistogramStorage * histogramStorage = (HistogramStorage*)histogram->data();
	MultiStarFinder msf(contentStorage, histogramStorage);
	StarFieldResult result;
	result.width = contentStorage->w;
	result.height = contentStorage->h;
	result.stars = msf.proceed(200);

    json j = result;
    std::string t = j.dump();
    entry->allocate(t.size());
    memcpy(entry->data(), t.data(), t.size());
    
    // strcpy((char*)entry->data(), "{\"value\":42.42}");

}



