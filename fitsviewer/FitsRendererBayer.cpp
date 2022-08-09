#include "FitsRenderer.h"

class FitsRendererBayer : public FitsRenderer {
    int levels[3][3];
    std::string bayer;

    // Do: R, G, B
    int8_t offset_r, second_r;
    int8_t offset_g, second_g;
    int8_t offset_b, second_b;

    LookupTable * table_r;
    LookupTable * table_g;
    LookupTable * table_b;

public:
    FitsRendererBayer(FitsRendererParam param);
    virtual ~FitsRendererBayer();

    virtual void prepare();
    // It is assumed that coordinates are compatible with bayer (multiple of 2)
    virtual uint8_t * render(int x0, int y0, int rw, int rh);
};

static void findBayerOffset(const std::string & bayerStr, char which, int8_t & offset, int8_t & second)
{
	const char * bayer = bayerStr.c_str();
	int p = 0;
	while((bayer[p]) && (bayer[p] != which)) {
		p++;
	}
	if (!bayer[p]) {
		offset = 0;
		second = -1;
		return;
	}
	offset = p;
	p++;
	while((bayer[p]) && (bayer[p] != which)) {
		p++;
	}
	if (!bayer[p]) {
		second = -1;
	} else {
		second = p;
	}
}

static int16_t bayerOffset(int8_t bayer, int w)
{
	if (bayer == -1) return -1;
	if (bayer < 2) {
		return bayer;
	} else {
		return bayer + w - 2;
	}
}

static inline void rectSumBayerRGGB(const uint16_t * data, int w, int h, int sx, int sy,
		const LookupTable & table_r,
		const LookupTable & table_g,
		const LookupTable & table_b,
		int32_t & r, int32_t & g, int32_t & b)
{
	r = 0;
	g = 0;
	b = 0;

	while(sy > 0) {
		for(int i = 0; i < sx; i += 2)
		{
			r += table_r.fastGet(data[i]);
			g += table_g.fastGet(data[i + 1]);
			g += table_g.fastGet(data[i + w]);
			b += table_b.fastGet(data[i + w + 1]);
		}
		data += 2*w;
		sy-=2;
	}
}


static inline void rectSumBayer(const uint16_t * data, int w, int h, int sx, int sy,
		const LookupTable & table_r, int16_t offset_r, int16_t second_r,
		const LookupTable & table_g, int16_t offset_g, int16_t second_g,
		const LookupTable & table_b, int16_t offset_b, int16_t second_b,
		int32_t & r, int32_t & g, int32_t & b)
{
	r = 0;
	g = 0;
	b = 0;

	while(sy > 0) {
		for(int i = 0; i < sx; i += 2)
		{
			r += table_r.fastGet(data[i + offset_r]);
			if (second_r != -1) r += table_r.fastGet(data[i + second_r]);
			g += table_g.fastGet(data[i + offset_g]);
			if (second_g != -1) g += table_g.fastGet(data[i + second_g]);
			b += table_b.fastGet(data[i + offset_b]);
			if (second_b != -1) b += table_b.fastGet(data[i + second_b]);
		}
		data += 2*w;
		sy-=2;
	}
}



static inline void applyScaleBinBayerAny(const u_int16_t * data, int w, int h,
				const LookupTable & table_r, int16_t offset_r, int16_t second_r,
				const LookupTable & table_g, int16_t offset_g, int16_t second_g,
				const LookupTable & table_b, int16_t offset_b, int16_t second_b,
				u_int8_t * result, int bin)
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
			int32_t v_r, v_g, v_b;
			rectSumBayer(data + bx, w, h, sx, sy,
					table_r, offset_r, second_r,
					table_g, offset_g, second_g,
					table_b, offset_b, second_b,
					v_r, v_g, v_b);

			if (shortX || shortY) {
				v_r /= (binDiv(sx, 1) * binDiv(sy,1));
				v_g /= (binDiv(sx, 1) * binDiv(sy,1));
				v_b /= (binDiv(sx, 1) * binDiv(sy,1));
			} else {
				v_r = v_r >> (2 * bin - 2 + (second_r != -1 ? 1 : 0));
				v_g = v_g >> (2 * bin - 2 + (second_g != -1 ? 1 : 0));
				v_b = v_b >> (2 * bin - 2 + (second_b != -1 ? 1 : 0));
			}
			result[0] = v_r;
			result[1] = v_g;
			result[2] = v_b;
			result+=3;
		}
		data += w * binStep;
	}
}

static inline void applyScaleBinBayerRGGBAny(const u_int16_t * data, int w, int h,
				const LookupTable & table_r,
				const LookupTable & table_g,
				const LookupTable & table_b,
				u_int8_t * result, int bin)
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
			int32_t v_r, v_g, v_b;
			rectSumBayerRGGB(data + bx, w, h, sx, sy,
					table_r,
					table_g,
					table_b,
					v_r, v_g, v_b);

			if (shortX || shortY) {
				v_r /= (binDiv(sx, 1) * binDiv(sy,1));
				v_g /= (binDiv(sx, 1) * binDiv(sy,1) * 2);
				v_b /= (binDiv(sx, 1) * binDiv(sy,1));
			} else {
				v_r = v_r >> (2 * bin - 2);
				v_g = v_g >> (2 * bin - 2 + 1);
				v_b = v_b >> (2 * bin - 2);
			}

			result[0] = v_r;
			result[1] = v_g;
			result[2] = v_b;
			result+=3;
		}
		data += w * binStep;
	}
}

static inline void applyScaleBinBayer2(const u_int16_t * data, int w, int h,
		const LookupTable & table_r, int16_t offset_r, int16_t second_r,
		const LookupTable & table_g, int16_t offset_g, int16_t second_g,
		const LookupTable & table_b, int16_t offset_b, int16_t second_b,
		u_int8_t * result)
{
	for(int by = 0; by < h; by += 2)
	{
		for(int bx = 0; bx < w; bx += 2)
		{
			{
				int32_t v_r = table_r.fastGet(data[bx + offset_r]);
				if (second_r != -1) {
					v_r += table_r.fastGet(data[bx + second_r]);
					v_r = v_r / 2;
				}
				result[0] = v_r;
			}

			{
				int32_t v_g = table_g.fastGet(data[bx + offset_g]);
				if (second_g != -1) {
					v_g += table_g.fastGet(data[bx + second_g]);
					v_g = v_g / 2;
				}
				result[1] = v_g;
			}

			{
				int32_t v_b = table_b.fastGet(data[bx + offset_b]);
				if (second_b != -1) {
					v_b += table_b.fastGet(data[bx + second_b]);
					v_b = v_b / 2;
				}
				result[2] = v_b;
			}
			result+=3;
		}
		data += w * 2;
	}
}


static inline void applyScaleBinBayer(const u_int16_t * data, int w, int h,
						const LookupTable & table_r, int16_t offset_r, int16_t second_r,
						const LookupTable & table_g, int16_t offset_g, int16_t second_g,
						const LookupTable & table_b, int16_t offset_b, int16_t second_b,
						u_int8_t * result, int bin)
{
	if (bin == 1) {
		applyScaleBinBayer2(data, w, h,
								table_r, offset_r, second_r,
								table_g, offset_g, second_g,
								table_b, offset_b, second_b,
								result);
	} else {
		if (offset_r == 0 && offset_g == 1 && second_g == w && offset_b == w + 1) {
			applyScaleBinBayerRGGBAny(data, w, h,
				table_r,
				table_g,
				table_b,
				result, bin);
		} else {
			applyScaleBinBayerAny(data, w, h,
				table_r, offset_r, second_r,
				table_g, offset_g, second_g,
				table_b, offset_b, second_b,
				result, bin);
		}
	}
}

FitsRenderer * FitsRenderer::buildBayer(FitsRendererParam param) {
    return new FitsRendererBayer(param);
}

FitsRendererBayer::FitsRendererBayer(FitsRendererParam param):
    FitsRenderer(param),
    bayer(param.bayer),
    table_r(nullptr), table_g(nullptr), table_b(nullptr)
{
}

FitsRendererBayer::~FitsRendererBayer() {
    if (table_r) delete table_r;
    if (table_g) delete table_g;
    if (table_b) delete table_b;
}

void FitsRendererBayer::prepare() {
    for(int i = 0; i < 3; ++i) {
        auto channelStorage = histogramStorage->channel(i);
        levels[i][0]= channelStorage->getLevel(low);
        levels[i][2]= channelStorage->getLevel(high);
        levels[i][1]= round(levels[i][0] + (levels[i][2] - levels[i][0]) * med);
    }
    std::cerr << "Levels are " << levels[0][0]  << " " << levels[0][1]<< " " << levels[0][2] << "\n";
    std::cerr << "Levels are " << levels[1][0]  << " " << levels[1][1]<< " " << levels[1][2] << "\n";
    std::cerr << "Levels are " << levels[2][0]  << " " << levels[2][1]<< " " << levels[2][2] << "\n";
    findBayerOffset(bayer, 'R', offset_r, second_r);
    findBayerOffset(bayer, 'G', offset_g, second_g);
    findBayerOffset(bayer, 'B', offset_b, second_b);

    table_r = new LookupTable(levels[0][0], levels[0][1], levels[0][2]);
    table_g = new LookupTable(levels[1][0], levels[1][1], levels[1][2]);
    table_b = new LookupTable(levels[2][0], levels[2][1], levels[2][2]);
}


uint8_t * FitsRendererBayer::render(int x0, int y0, int rw, int rh) {
    allocOutput(3 * binDiv(rw, bin) * binDiv(rh, bin));
    // FIXME : handler cases where rw != w
    applyScaleBinBayer(data + x0 + y0 * w, w, rh,
            *table_r, bayerOffset(offset_r, w), bayerOffset(second_r, w),
            *table_g, bayerOffset(offset_g, w), bayerOffset(second_g, w),
            *table_b, bayerOffset(offset_b, w), bayerOffset(second_b, w),
            output,
            bin);
    return output;
}
