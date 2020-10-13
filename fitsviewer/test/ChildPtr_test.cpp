#include "catch.hpp"

#include "../SharedCache.h"


TEST_CASE( "ChildPtr transfert is ok", "[ChildPtr]" ) {
    
    SECTION("deep clone of child_ptr") {
        SharedCache::Messages::ContentRequest * contentRequest = new SharedCache::Messages::ContentRequest();

        contentRequest->fitsContent = new SharedCache::Messages::RawContent();
        contentRequest->fitsContent->path = "/glop";
        contentRequest->astrometry = new SharedCache::Messages::Astrometry();
        contentRequest->astrometry->source = SharedCache::Messages::StarField();
        contentRequest->astrometry->source.source.path = "/plop";

        SharedCache::Messages::ContentRequest * duplicate = new SharedCache::Messages::ContentRequest(*contentRequest);


        REQUIRE(&*(duplicate->fitsContent) != &*(contentRequest->fitsContent));
        REQUIRE(&*(duplicate->astrometry) != &*(contentRequest->astrometry));
        // REQUIRE(&*(duplicate->astrometry->source) != &*(contentRequest->astrometry->source));

        delete(contentRequest);
        delete(duplicate);
    }
}


