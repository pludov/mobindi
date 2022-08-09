#include <stdlib.h>
#include "../FitsRenderer.h"

#include "catch.hpp"


uint16_t * buildFrame(int w, int h) {
    uint16_t * result = new uint16_t[w * h];
    uint16_t * out = result;
    for(int y = 0; y < h; ++y)
        for(int x = 0; x < w; ++x) {
            int v = ((x + y) / 2) << 8;
            *(out++) = v;
        }
    return result;
}

uint16_t getFrameValue(int x, int y)
{
    return ((x + y) / 2) << 8;
}

// Histogram such as 8 bit result will be the upper byte of 16 bit input
HistogramStorage * buildFlatHisto(int channels)
{
    uint16_t min[channels];
    uint16_t max[channels];
    for(int i = 0; i < channels; ++i) {
        min[i] = 0;
        max[i] = 0xffff;
    }

    HistogramStorage * result = (HistogramStorage*)malloc(HistogramStorage::requiredStorage(channels, min, max));
    result->init(channels, min, max);
    for(int ch = 0; ch < channels; ++ch) {
        result->channel(ch)->pixcount = 0x10000;
        for(int32_t v = 0; v < 0x10000; ++v) {
            result->channel(ch)->data[v] = v + 1;
        }
    }
    return result;
}


TEST_CASE( "Greyscale fits", "[Machin.cpp]" ) {
    for(int binShift = 0; binShift < 4; binShift++) {
        int bin = 1 << (binShift);
        

        SECTION("Grey 256x256, bin " + std::to_string(bin)) {
            // Create a file containing 256² 0x0000 to 0xFF00 
            int w = 256;
            int h = 256;
            uint16_t * frame = buildFrame(w, h);
            HistogramStorage * histo = buildFlatHisto(1);

            FitsRenderer * renderer;
            {
                FitsRendererParam r;
                r.data = frame;
                r.w = w;
                r.h = h;
                r.bin = binShift;
                r.low = 0;
                r.med = 0.5;
                r.high = 1;

                r.bayer = "";
                r.histogramStorage = histo;

                renderer = FitsRenderer::build(r);
            }

            renderer->prepare();
            auto result = renderer->render(0, 0, w, 8);
            
            int y = 0;
            for(int x = 0 ; x < 256 / bin; x++) {
                int v = 0;
                int count = 0;
                for(int kx = 0; kx < bin; ++kx)
                    for(int ky = 0; ky < bin; ++ky) {
                        int realx = x * bin + kx;
                        int realy = y * bin + ky;
                        auto rxv = getFrameValue(realx, realy) >> 8;
                        v += rxv;
                        count++;
                    }
                v = v / count;

                REQUIRE(result[x] ==  v);
            }
            delete renderer;
            free(histo);
            delete(frame);
        }
    }
}
