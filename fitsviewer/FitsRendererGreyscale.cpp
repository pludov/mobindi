#include "FitsRenderer.h"


class FitsRendererGreyscale : public FitsRenderer {

    LookupTable * lookupTable;
public:
    FitsRendererGreyscale(FitsRendererParam param);
    virtual ~FitsRendererGreyscale();

    virtual void prepare();
    // It is assumed that coordinates are compatible with bayer (multiple of 2)
    virtual uint8_t * render(int x0, int y0, int rw, int rh);
};


static inline void applyScale(const u_int16_t * data, int w, int h, const LookupTable & table, u_int8_t * result)
{
	int nbpix = w * h;

	for(int i = 0; i < nbpix; ++i) {
		result[i] = table.fastGet(data[i]);
	}
}


static inline int32_t rectSum(const uint16_t * data, int w, int h, int sx, int sy, const LookupTable & table)
{
	int32_t result = 0;
	while(sy > 0) {
		for(int i = 0; i < sx; ++i)
			result += table.fastGet(data[i]);
		data += w;
		sy--;
	}
	return result;
}

static inline void applyScaleBin2(const u_int16_t * data, int w, int h, const LookupTable & lookupTable, u_int8_t * result)
{
	for(int by = 0; by < h; by += 2)
	{
		for(int bx = 0; bx < w; bx += 2)
		{
			int16_t v = lookupTable.fastGet(data[bx]);
			v += lookupTable.fastGet(data[bx + 1]);
			v += lookupTable.fastGet(data[bx + w]);
			v += lookupTable.fastGet(data[bx + w + 1]);
			v /= 4;
			*result = v;
			result++;
		}
		data += w * 2;
	}
}

static inline void applyScaleBinAny(const u_int16_t * data, int w, int h, const LookupTable & lookupTable, u_int8_t * result, int bin)
{
	int binStep = 1 << bin;
	for(int by = 0; by < h; by += binStep)
	{
		bool shortY = by + binStep >= h;

		int sy = shortY ? h - by : binStep;

		for(int bx = 0; bx < w; bx += binStep)
		{
			bool shortX = bx + binStep >= w;

			int sx = shortX ? w - bx : binStep;
			int32_t v = rectSum(data + bx, w, h, sx, sy, lookupTable);
			if (shortX || shortY) {
				v /= (sx * sy);
			} else {
				v = v >> (bin+bin);
			}
			*result = v;
			result++;
		}
		data += w * binStep;
	}
}

// data, w, h
// result, de taille w/bin, h/bin
static inline void applyScaleBin(const u_int16_t * data, int w, int h, const LookupTable & lookupTable, u_int8_t * result, int bin)
{
	if (bin == 1 && ((w % 2) == 0) && ((h % 2) == 0)) {
		applyScaleBin2(data, w, h, lookupTable, result);
	} else {
		applyScaleBinAny(data, w, h, lookupTable, result, bin);
	}
}

FitsRenderer * FitsRenderer::buildGreyscale(FitsRendererParam param) {
    return new FitsRendererGreyscale(param);
}

FitsRendererGreyscale::FitsRendererGreyscale(FitsRendererParam param):
    FitsRenderer(param),
    lookupTable(nullptr)
{
}

FitsRendererGreyscale::~FitsRendererGreyscale() {
    if (lookupTable) delete lookupTable;
}

void FitsRendererGreyscale::prepare() {
    auto channelStorage = histogramStorage->channel(0);

    int lowAdu = channelStorage->getLevel(low);
    int highAdu = channelStorage->getLevel(high);
    int medAdu = round(lowAdu + (highAdu - lowAdu) * med);
    lookupTable = new LookupTable(lowAdu, medAdu, highAdu);
}

uint8_t * FitsRendererGreyscale::render(int x0, int y0, int rw, int rh) {
    allocOutput(binDiv(rw, bin) * binDiv(rh, bin));
    
    if (bin > 0) {
        applyScaleBin(data + y0 * w, w, rh, *lookupTable, output, bin);
    } else {
        applyScale(data + y0 * w, w, rh, *lookupTable, output);
    }

    return output;
}
