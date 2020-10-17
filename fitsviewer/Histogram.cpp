#include <math.h>

#include "fitsio.h"

#include "SharedCache.h"
#include "SharedCacheServer.h"
#include "RawDataStorage.h"
#include "HistogramStorage.h"


void HistogramChannelData::scanPlane(const u_int16_t * data, int w, int interline, int h)
{
	pixcount += w*h;
	while(h > 0) {
		int tw = w;
		while(tw > 0) {
			this->data[*data - min]++;
			data++;
			tw--;
		}
		data += interline - w;
		h--;
	}
}

// w and h must be even
void HistogramChannelData::scanBayer(const u_int16_t * data, int w, int interline, int h)
{
	pixcount += w * h / 4;
	int th = h / 2;
	while(th > 0) {
		int tw = w / 2;
		while(tw > 0) {
			uint16_t v = *data;
			if (v < min) {
				std::cerr << v << "<" << min << "\n";
			}
			if (v > max) {
				std::cerr << v << ">" << max << "\n";
			}
			this->data[v - min]++;
			data += 2;
			tw--;
		}
		data += 2 * interline - w;
		th--;
	}
}

void HistogramChannelData::scanPlaneMinMax(const u_int16_t * data, int w, int interline, int h, u_int16_t & min, u_int16_t & max)
{
	while(h > 0) {
		int tw = w;
		while(tw > 0) {
			uint16_t v = *data;
			if (v < min) min = v;
			if (v > max) max = v;
			data++;
			tw--;
		}
		data += interline - w;
		h--;
	}
}

// w and h must be even
void HistogramChannelData::scanBayerMinMax(const u_int16_t * data, int w, int interline, int h, u_int16_t & min, u_int16_t & max)
{
	int th = h / 2;
	while(th > 0) {
		int tw = w / 2;
		while(tw > 0) {
			uint16_t v = *data;
			if (v < min) min = v;
			if (v > max) max = v;
			data += 2;
			tw--;
		}
		data += 2 * interline - w;
		th--;
	}
}

void HistogramChannelData::cumulative() {
	u_int32_t current = 0;
	if (max >= min) {
		for(int i = 0; i < max - min + 1; ++i) {
			current += data[i];
			data[i] = current;
		}
	}
}


// first index for which count is at least wantedCount
uint32_t HistogramChannelData::findFirstWithAtLeast(u_int32_t wantedCount) const
{
	if (this->max < this->min) {
		return this->max;
	}
	uint32_t min = this->min, max = this->max;

	if (data[min - this->min] >= wantedCount) return min;
	while (min < max) {
		int med = (max + min) / 2;
		if (data[med - this->min] < wantedCount) {
			if (med == min) {
				return max;
			}
			min = med;
		} else {
			if (med == max) {
				return min;
			}
			max = med;
		}
	}
	return min;
}

u_int32_t HistogramChannelData::getLevel(double v) const{
	u_int32_t wantedCount = floor((double)(pixcount * v));
	// Search the first index i in counts for which count[i] >= wantedCount;
	return findFirstWithAtLeast(wantedCount);
}

double HistogramChannelData::getMoy(int minAdu, int maxAdu)
{
	uint64_t result = 0;
	uint64_t aduSum = 0;
	for(int i = minAdu; i < maxAdu; ++i)
	{
		long c = this->atAdu(i);
		result += i * c;
		aduSum += c;
	}
	
	return result * 1.0 / aduSum;
}


double HistogramChannelData::getStdDev(int minAdu, int maxAdu)
{
	double moy = getMoy(minAdu, maxAdu);
	double avgdst = 0;
	long adusum = 0;
	for(int i = minAdu; i < maxAdu; ++i)
	{
		int c = this->atAdu(i);
		avgdst += c * (i - moy) * (i - moy);
		adusum += c;
	}
	return sqrt(avgdst / adusum);
}


void SharedCache::Messages::Histogram::produce(Entry * entry)
{
	ContentRequest sourceRequest;
	sourceRequest.fitsContent = new RawContent(source);
	EntryRef sourceEntry(entry->getServer()->getEntry(sourceRequest));
	if (sourceEntry->hasError()) {
		sourceEntry->release();
		throw WorkerError(std::string("Source error : ") + sourceEntry->getErrorDetails());
	}

	RawDataStorage *rcs = (RawDataStorage*)sourceEntry->data();

	HistogramStorage::build(rcs, 0, 0, rcs->w - 1, rcs->h - 1, [&entry](long int size){
		entry->allocate(size);
		return entry->data();
	});
}

bool SharedCache::Messages::Histogram::asJsonResult(Entry * e, nlohmann::json&j) const {
	j = nlohmann::json::array();
	HistogramStorage * hs = (HistogramStorage *)e->data();
	for(int channel = 0; channel < hs->channelCount; ++channel)
	{
		HistogramChannelData * chdata = hs->channel(channel);
		std::vector<uint32_t> data;
		uint32_t sampleCount = chdata->sampleCount();
		data.resize(sampleCount);
		for(uint32_t i = 0; i < sampleCount; ++i) {
			data[i] = chdata->data[i];
		}

		j.push_back(nlohmann::json({
			{"min", chdata->min},
			{"max", chdata->max},
			{"pixcount", chdata->pixcount},
			{"bitpix", hs->bitpix},
			{"identifier", chdata->identifier},
			{"data", data}
		}));
	}
	return true;
}


// Adjust x to the min x>=x0 such as x & 1 = xOffset
static int toNextBayer(int x, int xOffset)
{
	int nvx = (x & ~1) + xOffset;
	if (nvx < x) nvx += 2;
	assert((nvx & 1) == xOffset);
	assert((nvx >= x));
	assert((nvx - 2 < x));
	return nvx;
}

// Adjust x to the max x<=x0 such as x & 1 = xOffset
static int toLastBayer(int x, int xOffset)
{
	int nvx = (x & ~1) + xOffset;
	if (nvx > x) nvx -= 2;
	assert((nvx & 1) == xOffset);
	assert((nvx <= x));
	assert((nvx + 2 > x));
	return nvx;
}

static bool bayerWindow(int interline, int x0, int y0, int x1, int y1, int xOffset, int yOffset, int & offset, int & w, int & h)
{
	// Adjust y0 to next next y that is y >= y & ~1 + xOffset
	x0 = toNextBayer(x0, xOffset);
	y0 = toNextBayer(y0, yOffset);
	x1 = toLastBayer(x1, xOffset);
	y1 = toLastBayer(y1, yOffset);
	
	if (x1 < x0 || y1 < y0) {
		return false;
	}

	w = x1 - x0 + 2;
	h = y1 - y0 + 2;
	offset = interline * y0 + x0;

	return true;

}

static bool flatWindow(int interline, int x0, int y0, int x1, int y1, int & offset, int & w, int & h)
{
	w = x1 - x0 + 1;
	h = y1 - y0 + 1;
	offset = interline * y0 + x0;
	return true;
}

const char *channelNames[] =  {"red", "green", "blue"};

HistogramStorage * HistogramStorage::build(
						const RawDataStorage *rcs,
						int x0, int y0, int x1, int y1,
						std::function<void* (long int)> allocator) {
	std::string bayer = rcs->getBayer();
	// int w = rcs->w;
	// int h = rcs->h;

	uint16_t min[3] = {65535,65535,65535}, max[3] = {0,0,0};
	int channelCount;
	channelCount = rcs->hasColors() ? 3 : 1;

	if (rcs->hasColors()) {
		channelCount = 3;
		for(int i = 0; i < 4; ++i) {
			int offset, w, h;
			if (bayerWindow(rcs->w, x0, y0, x1, y1, i & 1, (i & 2) >> 1, offset, w, h))
			{
				int hist = RawDataStorage::getRGBIndex(bayer[i]);
				HistogramChannelData::scanBayerMinMax(rcs->data + offset, w, rcs->w, h, min[hist], max[hist]);
			}

		}

	} else {
		channelCount = 1;
		int offset, w, h;
		if (flatWindow(rcs->w, x0, y0, x1, y1, offset, w, h)) {
			HistogramChannelData::scanPlaneMinMax(rcs->data + offset, w, rcs->w, h, min[0], max[0]);
		}
	}
	long int size = HistogramStorage::requiredStorage(channelCount, min, max);
	
	HistogramStorage * hs = (HistogramStorage *)allocator(size);
	hs->bitpix = 16;
	hs->init(channelCount, min, max);
	if (rcs->hasColors()) {
		for(int i = 0; i < 4; ++i) {
			int offset, w, h;
			if (bayerWindow(rcs->w, x0, y0, x1, y1, i & 1, (i & 2) >> 1, offset, w, h))
			{
				int hist = RawDataStorage::getRGBIndex(bayer[i]);
				hs->channel(hist)->scanBayer(rcs->data + offset, w, rcs->w, h);
			}
		}
	} else {
		int offset, w, h;
		if (flatWindow(rcs->w, x0, y0, x1, y1, offset, w, h)) {
			hs->channel(0)->scanPlane(rcs->data + offset, w, rcs->w, h);
		}
	}
	for(int i = 0; i < channelCount; ++i) {
		strcpy(hs->channel(i)->identifier, rcs->hasColors() ? channelNames[i] : "light");
		hs->channel(i)->cumulative();
	}
	return hs;
}
