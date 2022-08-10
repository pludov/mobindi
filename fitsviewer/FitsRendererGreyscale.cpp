#include "FitsRenderer.h"


class FitsRendererGreyscale : public FitsRenderer {

    LookupTable * lookupTable;
public:
    FitsRendererGreyscale(FitsRendererParam param);
    virtual ~FitsRendererGreyscale();

    virtual void prepare();
    // It is assumed that coordinates are compatible with bayer (multiple of 2)
    virtual uint8_t * render(int x0, int y0, int rw, int rh);

private:
	const uint16_t * getPix(int x, int y) const {
		return data + x + w * y; 
	}

	inline void applyScale(int x0, int y0, int sx, int sy, uint8_t * result, int result_stride) {
		auto src = getPix(x0, y0);

		for(int y = 0; y < sy; ++y) {
			int i = 0;
			for(int x = 0; x < sx; ++x) {
				result[i++] = lookupTable->fastGet(src[x]);
			}
			src += w;
			result += result_stride;
		}

	}

	inline int32_t rectSum(const uint16_t * data, int sx, int sy) const
	{
		int32_t result = 0;
		while(sy > 0) {
			for(int i = 0; i < sx; ++i)
				result += lookupTable->fastGet(data[i]);
			data += w;
			sy--;
		}
		return result;
	}

	inline void applyScaleBin2(int x0, int y0, int sx, int sy, u_int8_t * result, int result_stride) const
	{
		auto src = getPix(x0, y0);
		for(int by = 0; by < sy; by += 2)
		{
			int i = 0;
			for(int bx = 0; bx < sx; bx += 2)
			{
				int16_t v = lookupTable->fastGet(src[bx]);
				v += lookupTable->fastGet(src[bx + 1]);
				v += lookupTable->fastGet(src[bx + w]);
				v += lookupTable->fastGet(src[bx + w + 1]);
				v /= 4;
				result[i++] = v;
			}
			result += result_stride;
			src += 2 * w;
		}
	}

	inline void applyScaleBinAny(int x0, int y0, int sx, int sy, int bin, u_int8_t * result, int result_stride) const
	{
		int binStep = 1 << bin;
		auto src = getPix(x0, y0);
		for(int by = 0; by < sy; by += binStep)
		{
			int ry = by + y0;
			bool shortY = ry + binStep > y0 + sy;

			int pixsy = shortY ? y0 + sy - ry : binStep;

			int i = 0;
			fprintf(stderr, "by %d sy %d ry %d pixsy %d\n", by, sy, ry, pixsy);
			for(int bx = 0; bx < sx; bx += binStep)
			{
				int rx = bx + x0;

				bool shortX = rx + binStep > x0 + sx;

				int pixsx = shortX ? x0 + sx - rx : binStep;
				int32_t v = rectSum(src + bx, pixsx, pixsy);
				if (shortX || shortY) {
					v /= (pixsx * pixsy);
				} else {
					v = v >> (bin+bin);
				}
				result[i++] = v;
			}
			src += w * binStep;
			result += result_stride;
		}
	}

	// data, w, h
	// result, de taille w/bin, h/bin
	inline void applyScaleBin(int x0, int y0, int sx, int sy, int bin, u_int8_t * result, int result_stride)
	{
		if (bin == 1 && ((w % 2) == 0) && ((h % 2) == 0)) {
			applyScaleBin2(x0, y0, sx, sy, result, result_stride);
		} else {
			applyScaleBinAny(x0, y0, sx, sy, bin, result, result_stride);
		}
	}
};

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
    int result_stride = binDiv(rw, bin);
	allocOutput(result_stride * binDiv(rh, bin));
	
    if (bin > 0) {
        applyScaleBin(x0, y0, rw, rh, bin, output, result_stride);
    } else {
        applyScale(x0, y0, rw, rh, output, result_stride);
    }

    return output;
}
