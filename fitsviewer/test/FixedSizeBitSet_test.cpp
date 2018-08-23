#include <stdlib.h>

#include "catch.hpp"
#include "../FixedSizeBitSet.h"

static int testedSize[] = {1, 2, 4, 8, 15, 16, 31, 32, 33, 63, 64, 65, 127, 128, 129, 4095, 4096, 4097, 0};


TEST_CASE( "Bitset storage", "[FixedSizeBitSet.cpp]" ) {
    for(int i = 0; testedSize[i]; ++i) {
        int size = testedSize[i];
        SECTION("bit width: " + std::to_string(size)) {
            FixedSizeBitSet bitSet(size);

            REQUIRE(bitSet.getCardinality() == 0);
            REQUIRE(bitSet.size() == size);

            for(int j = 0; j <= i; ++j) {
                int pos = testedSize[j] - 1;

                bitSet.set(pos);
                REQUIRE(bitSet.get(pos) == true);
                REQUIRE(bitSet.getCardinality() == 1);

                REQUIRE(bitSet.nextSetBit(0) == pos);

                bitSet.clear(pos);
                REQUIRE(bitSet.get(pos) == false);
                REQUIRE(bitSet.getCardinality() == 0);
                REQUIRE(bitSet.nextSetBit(0) == -1);
            }

            bitSet.invert();

            REQUIRE(bitSet.getCardinality() == size);
            for(int j = 0; j <= i; ++j) {
                int pos = testedSize[j] - 1;

                bitSet.clear(pos);
                REQUIRE(bitSet.get(pos) == false);
                REQUIRE(bitSet.getCardinality() == size - 1);

                REQUIRE(bitSet.nextClearBit(0) == pos);

                bitSet.set(pos);
                REQUIRE(bitSet.get(pos) == true);
                REQUIRE(bitSet.getCardinality() == size);
                REQUIRE(bitSet.nextClearBit(0) == -1);
            }
        }
    }
};

static bool b1(int i) {
    return (i * 5) & 1;
}

static bool b2(int i) {
    return (i * 3 + 1) & 1;
}

static bool bitsetMatchFunc(const FixedSizeBitSet & b, std::function<bool (int)> value)
{
    for(int i = 0 ; i < b.size(); ++i)
    {
        if (b.get(i) != value(i)) {
            return false;
        }
    }
    return true;
}

TEST_CASE( "Bitset operators", "[FixedSizeBitSet.cpp") {
    for(int i = 0; testedSize[i]; ++i) {
        int size = testedSize[i];
        SECTION("bit width: " + std::to_string(size)) {
            FixedSizeBitSet v1(size);
            FixedSizeBitSet v2(size);

            for(int i = 0; i < size; ++i) {
                v1.set(i, b1(i));
                v2.set(i, b2(i));
            }
            
            SECTION("or") {
                v1 |= v2;
                REQUIRE(bitsetMatchFunc(v1, [](int i)->bool{return b1(i) || b2(i);}));
            };

            SECTION("and") {
                v1 &= v2;
                REQUIRE(bitsetMatchFunc(v1, [](int i)->bool{return b1(i) && b2(i);}));
            };

            SECTION("xor") {
                v1 ^= v2;
                REQUIRE(bitsetMatchFunc(v1, [](int i)->bool{return b1(i) != b2(i);}));
            };

            for(int j = 0; j <= i; ++j) {
                int shift = testedSize[j] - 1;

                SECTION("shift left of " + std::to_string(shift)) {
                    FixedSizeBitSet shifted = v1.shift(shift);

                    REQUIRE(bitsetMatchFunc(shifted, [size, shift](int i)->bool{return i - shift > 0 ? b1(i - shift) : false;}));
                };

                SECTION("shift right of " + std::to_string(shift)) {
                    FixedSizeBitSet shifted = v1.shift(-shift);

                    REQUIRE(bitsetMatchFunc(shifted, [size, shift](int i)->bool{return i + shift < size ? b1(i + shift) : false;}));
                };

            }
        };
    };
};