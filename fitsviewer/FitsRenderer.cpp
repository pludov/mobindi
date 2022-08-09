#include <cstdint>

#include <string>
#include <iostream>

#include "SharedCache.h"
#include "RawDataStorage.h"
#include "HistogramStorage.h"
#include "LookupTable.h"

#include "FitsRenderer.h"


FitsRenderer::FitsRenderer(FitsRendererParam param):
    data(param.data),
    w(param.w),
    h(param.h),
    bin(param.bin),
    low(param.low),
    med(param.med),
    high(param.high),
    histogramStorage(param.histogramStorage),
    output(nullptr),
    outputSize(0)
{
}
    

FitsRenderer::~FitsRenderer()
{
    if (output) free(output);
}

void FitsRenderer::allocOutput(unsigned int sze)
{
    if (sze > outputSize) {
        output = (uint8_t*)realloc((void*)output, sze);
        outputSize = sze;
    }
}

FitsRenderer * FitsRenderer::build(FitsRendererParam param)
{
    if (!param.bayer.empty()) {
        return FitsRenderer::buildBayer(param);
    }
    return FitsRenderer::buildGreyscale(param);
}
