#include <stdlib.h>

#include "catch.hpp"
#include "../StarFinder.h"

static uint8_t smallStar[] = {
#include "smallstar.h"
};

// To create a test data:
// Extract an image part using pixinsight, save it as tif (16bits)
// convert ~/small_star2.tif gray:plop => gives a low-endian file
// xxd --include < plop
// needs a function to convert as littleendian

using StarOccurence=SharedCache::Messages::StarOccurence;

RawDataStorage * load(int w, int h, uint8_t * data)
{
    RawDataStorage * result = (RawDataStorage *)::operator new (RawDataStorage::requiredStorage(w,h));
    result->setBayer("");
    result->setSize(w, h);

    unsigned pos = 0;
    for(int y = 0; y < h; ++y)
        for(int x = 0; x < w; ++x)
        {
            uint16_t v1 = data[pos++];
            uint16_t v2 = data[pos++];

            result->setAdu(x, y, v1 | (v2 << 8));
        }


    return result;
}




TEST_CASE( "StarFinder report FWHM", "[StarFinder]" ) {
    StarOccurence findResult;
    std::shared_ptr<RawDataStorage> source(load(57, 64, smallStar));

    SECTION("finds a star") {
        StarFinder sf(source.get(), ChannelMode(1), 32, 32, 16);
        REQUIRE(sf.perform(findResult) == true);
        REQUIRE(round(findResult.x) == 28);
        REQUIRE(round(findResult.y) == 32);
        REQUIRE(round(findResult.fwhm * 10) == 23);
        REQUIRE(round(findResult.peak * 100) == 25);
        REQUIRE(round(findResult.flux / 1000) == 51);
    }

};