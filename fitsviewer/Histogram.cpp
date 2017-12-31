#include <math.h>

#include "fitsio.h"

#include "SharedCache.h"
#include "SharedCacheServer.h"
#include "RawDataStorage.h"
#include "HistogramStorage.h"


void HistogramChannelData::scanPlane(u_int16_t * data, int w, int h)
{
	pixcount += w*h;
	while(h > 0) {
		int tw = w;
		while(tw > 0) {
			this->data[*data - min]++;
			data++;
			tw--;
		}
		h--;
	}
}

// w and h must be even
void HistogramChannelData::scanBayer(u_int16_t * data, int w, int h)
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
		data += w / 2;
		th--;
	}
}

void HistogramChannelData::scanPlaneMinMax(u_int16_t * data, int w, int h, u_int16_t & min, u_int16_t & max)
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
		h--;
	}
}

// w and h must be even
void HistogramChannelData::scanBayerMinMax(u_int16_t * data, int w, int h, u_int16_t & min, u_int16_t & max)
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
		data += w / 2;
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
	std::string bayer = rcs->getBayer();
	int w = rcs->w;
	int h = rcs->h;

	uint16_t min[3] = {65535,65535,65535}, max[3] = {0,0,0};
	int channelCount;
	channelCount = rcs->hasColors() ? 3 : 1;

	if (rcs->hasColors()) {
		channelCount = 3;
		for(int i = 0; i < 4; ++i) {
			int hist = RawDataStorage::getRGBIndex(bayer[i]);
			int offset = (i & 1) + ((i & 2) >> 1) * w;
			HistogramChannelData::scanBayerMinMax(rcs->data + offset, w, h, min[hist], max[hist]);
			std::cerr << "bounds for " << hist << " are "<< min[hist] <<" => " << max[hist] << "\n";
		}

	} else {
		HistogramChannelData::scanPlaneMinMax(rcs->data, w, h, min[0], max[0]);
		channelCount = 1;

	}
	long int size = HistogramStorage::requiredStorage(w, h, channelCount, min, max);
	entry->allocate(size);
	HistogramStorage * hs = (HistogramStorage *)entry->data();
	hs->init(w, h, channelCount, min, max);
	if (rcs->hasColors()) {
		for(int i = 0; i < 4; ++i) {
			int hist = RawDataStorage::getRGBIndex(bayer[i]);
			int offset = (i & 1) + ((i & 2) >> 1) * w;
			hs->channel(hist)->scanBayer(rcs->data + offset, w, h);
		}
	} else {
		hs->channel(0)->scanPlane(rcs->data, w, h);
	}
	for(int i = 0; i < channelCount; ++i) {
		hs->channel(i)->cumulative();
	}
}
