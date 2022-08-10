#include "FitsRenderer.h"

class FitsRendererBayer : public FitsRenderer {
    int levels[3][3];
    std::string bayer;

    // Do: R, G, B
    int16_t offset_r, second_r;
    int16_t offset_g, second_g;
    int16_t offset_b, second_b;

    LookupTable * table_r;
    LookupTable * table_g;
    LookupTable * table_b;

public:
    FitsRendererBayer(FitsRendererParam param);
    virtual ~FitsRendererBayer();

    virtual void prepare();
    // It is assumed that coordinates are compatible with bayer (multiple of 2)
    virtual uint8_t * render(int x0, int y0, int rw, int rh);

private:
	int16_t toBayerOffset(int8_t bayer)
	{
		if (bayer == -1) return -1;
		if (bayer < 2) {
			return bayer;
		} else {
			return bayer + w - 2;
		}
	}

	void findBayerOffset(const std::string & bayerStr, char which, int16_t & offset, int16_t & second)
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
		offset = toBayerOffset(offset);
		second = toBayerOffset(second);
	}


	// Assume data is aligned to a bayer start
	inline void rectSumBayerRGGB(const uint16_t * data, int sx, int sy,
								 int32_t & r, int32_t & g, int32_t & b)
	{
		r = 0;
		g = 0;
		b = 0;

		while(sy > 0) {
			for(int i = 0; i < sx; i += 2)
			{
				r += table_r->fastGet(data[i]);
				g += table_g->fastGet(data[i + 1]);
				g += table_g->fastGet(data[i + w]);
				b += table_b->fastGet(data[i + w + 1]);
			}
			data += 2*w;
			sy-=2;
		}
	}

	inline void rectSumBayer(const uint16_t * data, int sx, int sy,
								int32_t & r, int32_t & g, int32_t & b)
	{
		r = 0;
		g = 0;
		b = 0;

		while(sy > 0) {
			for(int i = 0; i < sx; i += 2)
			{
				r += table_r->fastGet(data[i + offset_r]);
				if (second_r != -1) r += table_r->fastGet(data[i + second_r]);
				g += table_g->fastGet(data[i + offset_g]);
				if (second_g != -1) g += table_g->fastGet(data[i + second_g]);
				b += table_b->fastGet(data[i + offset_b]);
				if (second_b != -1) b += table_b->fastGet(data[i + second_b]);
			}
			data += 2*w;
			sy-=2;
		}
	}

	void applyScaleBinBayerAny(int x0, int y0, int sx, int sy, int bin, u_int8_t * result, int result_stride)
	{
		int binStep = 1 << bin;
		auto src = getPix(x0, y0);

		for(int by = 0; by < sy; by += binStep)
		{
			int ry = by + y0;
			bool shortY = ry + binStep > y0 + sy;

			int pixsy = shortY ? y0 + sy - ry : binStep;

			int i = 0;

			for(int bx = 0; bx < sx; bx += binStep)
			{
				int rx = bx + x0;

				bool shortX = rx + binStep > x0 + sx;

				int pixsx = shortX ? x0 + sx - rx : binStep;

				int32_t v_r, v_g, v_b;

				rectSumBayer(src + bx, pixsx, pixsy,
							 v_r, v_g, v_b);

				if (shortX || shortY) {
					v_r /= (binDiv(pixsx, 1) * binDiv(pixsy,1));
					v_g /= (binDiv(pixsx, 1) * binDiv(pixsy,1));
					v_b /= (binDiv(pixsx, 1) * binDiv(pixsy,1));
					if (second_r != -1) v_r /= 2;
					if (second_g != -1) v_g /= 2;
					if (second_b != -1) v_b /= 2;
				} else {
					v_r = v_r >> (2 * bin - 2 + (second_r != -1 ? 1 : 0));
					v_g = v_g >> (2 * bin - 2 + (second_g != -1 ? 1 : 0));
					v_b = v_b >> (2 * bin - 2 + (second_b != -1 ? 1 : 0));
				}
				result[i++] = v_r;
				result[i++] = v_g;
				result[i++] = v_b;
			}
			src += w * binStep;
			result += result_stride;
		}
	}

	void applyScaleBinBayerRGGBAny(int x0, int y0, int sx, int sy, int bin, u_int8_t * result, int result_stride)
	{
		int binStep = 1 << bin;
		auto src = getPix(x0, y0);

		for(int by = 0; by < sy; by += binStep)
		{
			int ry = by + y0;
			bool shortY = ry + binStep > y0 + sy;

			int pixsy = shortY ? y0 + sy - ry : binStep;

			int i = 0;

			for(int bx = 0; bx < sx; bx += binStep)
			{
				int rx = bx + x0;

				bool shortX = rx + binStep > x0 + sx;

				int pixsx = shortX ? x0 + sx - rx : binStep;

				int32_t v_r, v_g, v_b;

				rectSumBayerRGGB(src + bx, pixsx, pixsy,
							 v_r, v_g, v_b);

				if (shortX || shortY) {
					v_r /= (binDiv(pixsx, 1) * binDiv(pixsy,1));
					v_g /= (binDiv(pixsx, 1) * binDiv(pixsy,1) * 2);
					v_b /= (binDiv(pixsx, 1) * binDiv(pixsy,1));
				} else {
					v_r = v_r >> (2 * bin - 2);
					v_g = v_g >> (2 * bin - 2 + 1);
					v_b = v_b >> (2 * bin - 2);
				}
				result[i++] = v_r;
				result[i++] = v_g;
				result[i++] = v_b;
			}
			src += w * binStep;
			result += result_stride;
		}
	}

	inline void applyScaleBinBayer2(int x0, int y0, int sx, int sy, u_int8_t * result, int result_stride)
	{
		auto src = getPix(x0, y0);

		for(int by = 0; by < sy; by += 2)
		{
			int i = 0;
			for(int bx = 0; bx < sx; bx += 2)
			{
				{
					int32_t v_r = table_r->fastGet(src[bx + offset_r]);
					if (second_r != -1) {
						v_r += table_r->fastGet(src[bx + second_r]);
						v_r = v_r / 2;
					}
					result[i++] = v_r;
				}

				{
					int32_t v_g = table_g->fastGet(src[bx + offset_g]);
					if (second_g != -1) {
						v_g += table_g->fastGet(src[bx + second_g]);
						v_g = v_g / 2;
					}
					result[i++] = v_g;
				}

				{
					int32_t v_b = table_b->fastGet(src[bx + offset_b]);
					if (second_b != -1) {
						v_b += table_b->fastGet(src[bx + second_b]);
						v_b = v_b / 2;
					}
					result[i++] = v_b;
				}
			}
			src += w * 2;
			result += result_stride;
		}
	}

	inline void applyScaleBinBayer(int x0, int y0, int sx, int sy, int bin, u_int8_t * result, int result_stride)
	{
		if (bin == 1) {
			applyScaleBinBayer2(x0, y0, sx, sy, result, result_stride);
		} else {
			if (offset_r == 0 && offset_g == 1 && second_g == w && offset_b == w + 1) {
				applyScaleBinBayerRGGBAny(x0, y0, sx, sy, bin, result, result_stride);
			} else {
				applyScaleBinBayerAny(x0, y0, sx, sy, bin, result, result_stride);
			}
		}
	}

};

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
    int outputStride = 3 * binDiv(rw, bin);
	allocOutput(outputStride * binDiv(rh, bin));
    applyScaleBinBayer(x0, y0, rw, rh, bin, output, outputStride);
    return output;
}
