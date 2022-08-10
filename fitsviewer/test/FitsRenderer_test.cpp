#include <stdlib.h>
#include "../FitsRenderer.h"

#include "catch.hpp"


class TestFrame {
public:
    uint16_t * data;
    int w, h;

    TestFrame() {
        data = nullptr;
        w = 0;
        h = 0;
    }

    virtual ~TestFrame() {
        dispose();
    }

    void build(int w, int h) {
        this->w = w;
        this->h = h;
        this->data = new uint16_t[w * h];
        auto out = this->data;
        for(int y = 0; y < h; ++y) {
            for(int x = 0; x < w; ++x) {
                *(out++) = getValue(x, y);
            }
        }
    }

    void dispose() {
        delete [] data;
        data = nullptr;
    }

    virtual uint16_t getValue(int x, int y) const = 0;
    virtual bool color() const = 0;
    virtual std::string title() const = 0;
};

// This frame ranges from 0 to 0xFF00
class TestFrameGrey : public TestFrame {
public:
    virtual uint16_t getValue(int x, int y) const {
        x &= 255;
        y &= 255;
        return ((x + y) / 2) * 256;
    }

    virtual bool color() const {
        return false;
    }

    virtual std::string title() const {
        return "greyscale";
    }
};

// This frame ranges from 0 to 0xFF00
// red tops at 0,0
// green tops at 0,255
// blue tops at 255, 0
class TestFrameColor : public TestFrame {
    virtual uint16_t getValue(int x, int y) const {
        int kx = x & 1;
        int ky = y & 1;
        x &= 255;
        y &= 255;
        if (kx == 0 && ky == 0) {
            // red
            x = 255 - x;
            y = 255 - y;
        } else if (kx == 1 && ky == 1) {
            // blue
            y = 255 - y;
        } else {
            // green
            x = 255 - x;
        }
        return ((x + y) / 2) * 256;
    }

    virtual bool color() const {
        return true;
    }
    virtual std::string title() const {
        return "bayer";
    }
};

class FrameInterpreter {
public:
    FrameInterpreter() {}
    virtual ~FrameInterpreter() {}

    virtual std::string bayer() const = 0;
    virtual int minBinPow() const = 0;
    virtual int channelCount() const = 0;
    virtual void calc(TestFrame * tp, int x, int y, int size, uint16_t * result) = 0;
};

class GreyscaleFrameInterpreter: public FrameInterpreter{
public:
    virtual std::string bayer() const { return ""; }
    virtual int channelCount() const { return 1; }
    virtual int minBinPow() const { return 0; };
    
    virtual void calc(TestFrame * tp, int x, int y, int size, uint16_t * result)
    {
        uint32_t value = 0;
        uint32_t count = 0;

        for(int iy = 0; iy < size; ++iy) {
            for(int ix = 0; ix < size; ++ix) {
                int rx = x + ix;
                int ry = y + iy;
                if (rx >= tp->w) continue;
                if (ry >= tp->h) continue;

                value += tp->getValue(rx, ry);
                count++;
            }
        }

        result[0] = count ? value / count : 0;
    }
};

class ColorFrameInterpreter: public FrameInterpreter{
public:
    virtual std::string bayer() const { return "RGGB"; }
    virtual int channelCount() const { return 3; }
    virtual int minBinPow() const { return 1; };
    
    virtual void calc(TestFrame * tp, int x, int y, int size, uint16_t * result)
    {
        uint32_t values[3] = {0, 0, 0};
        uint32_t count[3] = {0, 0, 0};
        
        for(int iy = 0; iy < size; ++iy) {
            for(int ix = 0; ix < size; ++ix) {
                int rx = x + ix;
                int ry = y + iy;
                if (rx >= tp->w) continue;
                if (ry >= tp->h) continue;

                int kx = rx & 1;
                int ky = ry & 1;
                int chann;
                if (kx == 0 && ky == 0) {
                    // Red
                    chann = 0;
                } else if (kx == 1 && ky == 1) {
                    chann = 2;
                } else {
                    chann = 1;
                }
                auto v = tp->getValue(rx, ry);
                values[chann] += v;
                count[chann] ++;
            }
        }

        for(int chann = 0; chann < 3; ++chann) {
            result[chann] = count[chann] ? values[chann] / count[chann] : 0;
        }
    }
};


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


struct Rectangle {
    int x0, y0, w, h;
};

struct Test {
    TestFrame * frame;
    FrameInterpreter * interpreter;
    int w, h;
    std::vector<Rectangle> rectangles;
};

TEST_CASE( "FITS rendering", "[FitsRenderer.cpp]" ) {
    Test tests[] = {
        {
            new TestFrameGrey(),
            new GreyscaleFrameInterpreter(),
            256, 256,
            {
                {0, 0, 256, 8},
                {33, 33, 23, 23},
                {0, 248, 256, 8}
            }
        },
        {
            new TestFrameGrey(),
            new GreyscaleFrameInterpreter(),
            // Neither a multiple of 2 and 4
            127, 127,
            {
                {0, 0, 127, 8},
                {33, 33, 23, 23},
                {0, 119, 127, 7}
            }
        },
        {
            new TestFrameColor(),
            new ColorFrameInterpreter(),
            256, 256,
            {
                {0, 0, 256, 8},
                {33, 33, 23, 23},
                {0, 248, 256, 8}
            }
        },
        {
            new TestFrameColor(),
            new ColorFrameInterpreter(),
            126, 126,
            {
                {0, 0, 127, 8},
                {33, 33, 23, 23},
                {0, 119, 127, 7}
            }
        }
    };

    for(int testId = 0; testId < (int)(sizeof(tests) / sizeof(Test)); ++testId) {
        auto test = tests[testId];
        for(int binShift = 0; binShift < 4; binShift++) {
            if (binShift < test.interpreter->minBinPow()) {
                continue;
            }
            int bin = 1 << (binShift);
            
            SECTION(test.frame->title() + " " + std::to_string(test.w) + "x" + std::to_string(test.h) + ", bin " + std::to_string(bin)) {

                test.frame->build(test.w, test.h);

                HistogramStorage * histo = buildFlatHisto(test.interpreter->channelCount());

                FitsRenderer * renderer;
                {
                    FitsRendererParam r;
                    r.data = test.frame->data;
                    r.w = test.frame->w;
                    r.h = test.frame->h;
                    r.bin = binShift;
                    r.low = 0;
                    r.med = 0.5;
                    r.high = 1;

                    r.bayer = test.interpreter->bayer();
                    r.histogramStorage = histo;

                    renderer = FitsRenderer::build(r);
                }

                renderer->prepare();

                for(auto rec : test.rectangles) {
                    int x0 = (rec.x0 / bin) * bin;
                    int y0 = (rec.y0 / bin) * bin;
                    int x1 = rec.x0 + rec.w - 1;
                    int y1 = rec.y0 + rec.h - 1;

                    // Round according to bin
                    x1 = bin * (x1 / bin) + (bin - 1);
                    y1 = bin * (y1 / bin) + (bin - 1);
                    if (x1 >= test.w) x1 = test.w - 1;
                    if (y1 >= test.h) y1 = test.h - 1;

                    int sw = x1 - x0 + 1;
                    int sh = y1 - y0 + 1;
                    INFO("Square at " + std::to_string(x0) + "," + std::to_string(y0) + " for " + std::to_string(sw) + "x" + std::to_string(sh))

                    auto result = renderer->render(x0, y0, sw, sh);
                    int outSize = binDiv(sw, binShift) * binDiv(sh, binShift);
                    std::vector<uint16_t> resultVec(result, result + outSize * test.interpreter->channelCount());

                    std::vector<uint16_t> expectedVec(outSize * test.interpreter->channelCount());

                    uint16_t expected[test.interpreter->channelCount()];
                    auto write = expectedVec.begin();
                    for(int y = y0; y <= y1; y += bin)
                        for(int x = x0; x <= x1; x += bin) {
                            test.interpreter->calc(test.frame, x, y, bin, expected);
                            for(int ch = 0; ch < test.interpreter->channelCount();++ch) {
                                *(write++) = expected[ch] >> 8;
                            }
                        }

                    REQUIRE(resultVec == expectedVec);
                }

                delete renderer;

                free(histo);
                test.frame->dispose();
            }
        }
    }
}
