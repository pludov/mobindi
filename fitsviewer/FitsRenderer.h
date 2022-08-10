#include <cstdint>

#include <string>
#include <iostream>

#include "SharedCache.h"
#include "RawDataStorage.h"
#include "HistogramStorage.h"
#include "LookupTable.h"


class FitsRendererParam {
public:
    const uint16_t * data;
    int w, h, bin;
    double low, med, high;
    std::string bayer;
    const HistogramStorage * histogramStorage;
};

class FitsRenderer {

protected:
    const uint16_t * data;
    int w, h;
    int bin;
    double low, med, high;

    const HistogramStorage * histogramStorage;
    uint8_t * output;
    unsigned long int outputSize;
    void allocOutput(unsigned int sze);

    FitsRenderer(FitsRendererParam param);

    static FitsRenderer * buildBayer(FitsRendererParam param);
    static FitsRenderer * buildGreyscale(FitsRendererParam param);
    
    const uint16_t * getPix(int x, int y) const {
		return data + x + w * y; 
	}


public:
    virtual ~FitsRenderer() = 0;
    virtual void prepare() = 0;
    virtual uint8_t * render(int x0, int y0, int rw, int rh) = 0;

    static FitsRenderer * build(FitsRendererParam param);
};


inline int binDiv(int width, int bin)
{
	if (!bin) return width;
	int rslt = width >> bin;
	if ((rslt << bin) < width) {
		rslt++;
	}
	return rslt;
}
