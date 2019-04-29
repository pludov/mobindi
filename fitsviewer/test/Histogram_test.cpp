#include <stdlib.h>
#include <string.h>

#include "catch.hpp"
#include "../RawDataStorage.h"
#include "../HistogramStorage.h"

static int testedSize[] = {1, 2, 4, 8, 15, 16, 31, 32, 33, 63, 64, 65, 127, 128, 129, 4095, 4096, 4097, 0};
static uint16_t pixels5x7[] = {
            0,0,0,0,0,
            0,0,1,1,0,
            0,0,1,1,0,
            0,0,0,0,0,
            0,0,0,0,0,
            0,0,0,0,0,
            1,0,0,0,1,
};

// G=1 in top-left
// R = 2 in bottom-right
// B = 3 in bottom-left
static uint16_t bayer8x6[] = {
            0,1,0,1,0,0,0,0,
            1,0,1,0,0,0,0,0,
            0,1,0,1,2,0,0,0,
            1,3,1,3,0,0,0,0,
            0,0,0,0,0,0,2,0,
            0,3,0,3,0,0,0,0,
            
};

static RawDataStorage * buildRDS(int w, int h, uint16_t* data)
{
    RawDataStorage * content = (RawDataStorage*)(::operator new(RawDataStorage::requiredStorage(w, h)));
    content->w = w;
    content->h = h;
    content->bayer[0] = 0;
    memcpy(content->data, data, w * h * sizeof(uint16_t));
    return content;
}

static RawDataStorage * buildBayerRDS(int w, int h, uint16_t* data)
{
    RawDataStorage * content = (RawDataStorage*)(::operator new(RawDataStorage::requiredStorage(w, h)));
    content->w = w;
    content->h = h;
    content->bayer[0] = 'R';
    content->bayer[1] = 'G';
    content->bayer[2] = 'G';
    content->bayer[3] = 'B';
    memcpy(content->data, data, w * h * sizeof(uint16_t));
    return content;
}

TEST_CASE( "Histogram scanning", "[Histogram.cpp]" ) {
    for(int i = 0; testedSize[i]; ++i) {
        int size = testedSize[i];
        SECTION("Full size 1ch") {
            std::unique_ptr<RawDataStorage> rds(buildRDS(5,7,pixels5x7));

            std::unique_ptr<HistogramStorage> hs(HistogramStorage::build(rds.get(), 0, 0, 4, 6, [](long int size){return ::operator new(size);}));

            REQUIRE(hs->channelCount == 1);
            REQUIRE(hs->channel(0)->min == 0);
            REQUIRE(hs->channel(0)->max == 1);
            REQUIRE(hs->channel(0)->atAdu(0) == 35 - 6);
            REQUIRE(hs->channel(0)->atAdu(1) == 6);
        }

        SECTION("Sub size 1ch") {
            std::unique_ptr<RawDataStorage> rds(buildRDS(5,5,pixels5x7));

            std::unique_ptr<HistogramStorage> hs(HistogramStorage::build(rds.get(), 2, 1, 3, 3, [](long int size){return ::operator new(size);}));

            REQUIRE(hs->channelCount == 1);
            REQUIRE(hs->channel(0)->min == 0);
            REQUIRE(hs->channel(0)->max == 1);
            REQUIRE(hs->channel(0)->atAdu(0) == 2);
            REQUIRE(hs->channel(0)->atAdu(1) == 4);
        }

        SECTION("Full size bayer") {
            std::unique_ptr<RawDataStorage> rds(buildBayerRDS(8,6,bayer8x6));

            std::unique_ptr<HistogramStorage> hs(HistogramStorage::build(rds.get(), 0, 0, 7, 5, [](long int size){return ::operator new(size);}));

            REQUIRE(hs->channelCount == 3);

            // R
            REQUIRE(hs->channel(0)->min == 0);
            REQUIRE(hs->channel(0)->max == 2);
            REQUIRE(hs->channel(0)->atAdu(0)+hs->channel(0)->atAdu(2) == 12);
            REQUIRE(hs->channel(0)->atAdu(2) == 2);

            // G
            REQUIRE(hs->channel(1)->min == 0);
            REQUIRE(hs->channel(1)->max == 1);
            REQUIRE(hs->channel(1)->atAdu(0)+hs->channel(1)->atAdu(1) == 24);
            REQUIRE(hs->channel(1)->atAdu(1) == 8);

            // B
            REQUIRE(hs->channel(2)->min == 0);
            REQUIRE(hs->channel(2)->max == 3);
            REQUIRE(hs->channel(2)->atAdu(0)+hs->channel(2)->atAdu(3) == 12);
            REQUIRE(hs->channel(2)->atAdu(3) == 4);
        }

        SECTION("Partial size bayer") {
            std::unique_ptr<RawDataStorage> rds(buildBayerRDS(8,6,bayer8x6));

            std::unique_ptr<HistogramStorage> hs(HistogramStorage::build(rds.get(), 3, 2, 4, 3, [](long int size){return ::operator new(size);}));

            REQUIRE(hs->channelCount == 3);

            // R
            REQUIRE(hs->channel(0)->min == 2);
            REQUIRE(hs->channel(0)->max == 2);
            REQUIRE(hs->channel(0)->atAdu(2) == 1);

            // G
            REQUIRE(hs->channel(1)->min == 0);
            REQUIRE(hs->channel(1)->max == 1);
            REQUIRE(hs->channel(1)->atAdu(0)+hs->channel(1)->atAdu(1) == 2);
            REQUIRE(hs->channel(1)->atAdu(1) == 1);

            // B
            REQUIRE(hs->channel(2)->min == 3);
            REQUIRE(hs->channel(2)->max == 3);
            REQUIRE(hs->channel(2)->atAdu(3) == 1);
        }

    }
};

