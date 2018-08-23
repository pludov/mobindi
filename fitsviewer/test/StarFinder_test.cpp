#include <stdlib.h>

#include "catch.hpp"
#include "../StarFinder.h"

RawDataStorage * noise(int w, int h, int black, int blackLarg)
{
    RawDataStorage * result = (RawDataStorage *)::operator new (RawDataStorage::requiredStorage(w,h));
    result->setBayer("");
    result->setSize(w, h);

    srand(0);
    for(int y = 0; y < h; ++y)
        for(int x = 0; x < w; ++x)
        {
            result->setAdu(x, y, black - blackLarg + rand() % (2 * blackLarg + 1));
        }


    return result;
}




TEST_CASE( "StarFinder works", "[StarFinder]" ) {
    StarFindResult findResult;
    std::shared_ptr<RawDataStorage> source(noise(64, 64, 100, 25));

                // // 0123456789ABCDEF
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                ",
                //   "                "));
    
    SECTION("finds nothing on center") {
        StarFinder sf(source.get(), ChannelMode(1), 32, 32, 16);
        REQUIRE(sf.perform(findResult) == false);
    }

    SECTION("finds nothing on 0,0 corner") {
        StarFinder sf(source.get(), ChannelMode(1), 8, 8, 16);
        REQUIRE(sf.perform(findResult) == false);
    }

    SECTION("finds nothing on 1,0 corner") {
        StarFinder sf(source.get(), ChannelMode(1), 56, 8, 16);
        REQUIRE(sf.perform(findResult) == false);
    }

    SECTION("finds nothing on 0,1 corner") {
        StarFinder sf(source.get(), ChannelMode(1), 8, 56, 16);
        REQUIRE(sf.perform(findResult) == false);
    }

    SECTION("finds nothing on 1,1 corner") {
        StarFinder sf(source.get(), ChannelMode(1), 56, 56, 16);
        REQUIRE(sf.perform(findResult) == false);
    }
};