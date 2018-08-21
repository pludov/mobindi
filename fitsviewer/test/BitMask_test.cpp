#include "catch.hpp"
#include "../BitMask.h"


template <typename... Args>
std::vector<typename std::common_type<Args...>::type> mkv(Args&&... args) {
    return {args...};
}


static int cmpCouple(int x0, int y0, int x1, int y1)
{
    if (y0 < y1) {
        return -1;
    }
    if (y0 > y1) {
        return 1;
    }
    if (x0 < x1) {
        return -1;
    }
    if (x0 > x1) {
        return 1;
    }
    return 0;
}
static std::vector<int> sortPointsXY(const std::vector<int> & points)
{
    std::vector<int> result = points;
    for(int i = 0; i < result.size(); i += 2) {
        for(int j = i+2; j < result.size(); j += 2) {
            if (cmpCouple(result[i], result[i + 1], result[j], result[j + 1]) > 0) {
                int tx = result[i];
                int ty = result[i + 1];
                result[i] = result[j];
                result[i+1] = result[j+1];
                result[j] = tx;
                result[j+1] = ty;
            }

        }
    }
    return result;
}

TEST_CASE( "BitMask representation is ok", "[BitMask]" ) {
    BitMask bitmask(0,0,7,7);

    SECTION("empty") {

        REQUIRE(bitmask.toString() == 
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n");
        REQUIRE(bitmask.isEmpty() == true);
        REQUIRE(bitmask.get(5,3) == false);
        REQUIRE(bitmask.isClear(5,3) == true);
        REQUIRE(bitmask.get(7,0) == false);
        REQUIRE(bitmask.calcConnexityGroups() == std::vector<std::vector<int>>());

    }

    SECTION("single bit") {
        bitmask.set(5,2, 1);
        REQUIRE(bitmask.get(5,2) == true);
        REQUIRE(bitmask.isClear(5,2) == false);
        REQUIRE(bitmask.get(7,0) == false);
        REQUIRE(bitmask.isClear(7,2) == true);
        REQUIRE(bitmask.toString() ==
                    "        \n"
                    "        \n"
                    "     x  \n"
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n");
        REQUIRE(bitmask.calcConnexityGroups() == mkv(mkv(5,2)));
        SECTION("erose single bit") {
            bitmask.erode();
            REQUIRE(bitmask.isEmpty() == true);
        }
        SECTION("grow single bit") {
            bitmask.grow();
            REQUIRE(bitmask.toString() ==
                    "        \n"
                    "     x  \n"
                    "    xxx \n"
                    "     x  \n"
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n");
            REQUIRE(bitmask.calcConnexityGroups() == mkv(mkv(5,1,4,2,5,2,6,2,5,3)));
        }
    }
    SECTION("complex connexity") {
        auto points = mkv(0,0,0,1,1,1,1,2,2,2,3,2,3,1,4,1,4,0);
        for(int i = 0; i < points.size(); i += 2) {
            bitmask.set(points[i],points[i + 1], 1);
        }

        REQUIRE(bitmask.toString() ==
                    "x   x   \n"
                    "xx xx   \n"
                    " xxx    \n"
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n"
                    "        \n");
        REQUIRE(bitmask.calcConnexityGroups() == mkv(sortPointsXY(points)));
    }

}
