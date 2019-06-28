#include "catch.hpp"

#include "../SharedCache.h"


TEST_CASE( "ChildPtr transfert is ok", "[ChildPtr]" ) {
    
    SECTION("deep clone of child_ptr") {
        SharedCache::Messages::ContentRequest * contentRequest = new SharedCache::Messages::ContentRequest();

        contentRequest->fitsContent = new SharedCache::Messages::RawContent();
        

        SharedCache::Messages::ContentRequest * duplicate = new SharedCache::Messages::ContentRequest(*contentRequest);


        REQUIRE(&*(duplicate->fitsContent) != &*(contentRequest->fitsContent));

        delete(contentRequest);
        delete(duplicate);
    }
}


