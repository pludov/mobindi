
#include "json.hpp"
#include "fitsio.h"

#include "SharedCacheServer.h"
#include "SharedCache.h"
#include "StarFinder.h"
#include "Astrometry.h"

using namespace std;
using nlohmann::json;


void SharedCache::Messages::Astrometry::produce(SharedCache::Entry* entry)
{
    json j;

	SharedCache::Messages::ContentRequest contentRequest;
	contentRequest.jsonQuery = new SharedCache::Messages::JsonQuery();
    contentRequest.jsonQuery->starField = new SharedCache::Messages::StarField(source);
	SharedCache::EntryRef starField(entry->getServer()->getEntry(contentRequest));
	if (starField->hasError()) {
        starField->release();
		throw WorkerError(std::string("Source error : ") + starField->getErrorDetails());
	}
	RawDataStorage * contentStorage = (RawDataStorage *)starField->data();
    std::string source((const char*)starField->data(), starField->size());

    j = nlohmann::json::parse(source);
    std::vector<StarFindResult> starFieldData = j;

    j = starFieldData;
    std::string t = j.dump();
    entry->allocate(t.size());
    memcpy(entry->data(), t.data(), t.size());
}

