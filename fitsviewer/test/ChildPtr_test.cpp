#include "catch.hpp"

#include "../SharedCache.h"


TEST_CASE( "ChildPtr transfert is ok", "[ChildPtr]" ) {
    
    SECTION("deep clone of child_ptr") {
        SharedCache::Messages::ContentRequest * contentRequest = new SharedCache::Messages::ContentRequest();

        contentRequest->fitsContent = new SharedCache::Messages::RawContent();
        contentRequest->fitsContent->path = "/glop";
        contentRequest->jsonQuery = new SharedCache::Messages::JsonQuery();
        contentRequest->jsonQuery->starField = new SharedCache::Messages::StarField();
        contentRequest->jsonQuery->starField->source.path = "/plop";

        SharedCache::Messages::ContentRequest * duplicate = new SharedCache::Messages::ContentRequest(*contentRequest);


        REQUIRE(&*(duplicate->fitsContent) != &*(contentRequest->fitsContent));
        REQUIRE(&*(duplicate->jsonQuery) != &*(contentRequest->jsonQuery));
        REQUIRE(&*(duplicate->jsonQuery->starField) != &*(contentRequest->jsonQuery->starField));

        delete(contentRequest);
        delete(duplicate);
    }
}


