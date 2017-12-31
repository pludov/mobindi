#ifndef HISTOGRAMSTORAGE_H
#define HISTOGRAMSTORAGE_H 1
#include <stdint.h>

struct HistogramChannelData {
	uint16_t min, max;
	uint32_t pixcount;
	uint32_t data[0];

	uint32_t sampleCount() const {
		if (max >= min) {
			return (((uint32_t)max) - (uint32_t)min) + 1;
		}
		return 0;
	}

	/* ==== functions for productions ==== */
	void scanBayer(uint16_t * data, int w, int h);
	void scanPlane(uint16_t * data, int w, int h);
	// value for an adu X will be the count of adu of value up to X. This is the default form
	void cumulative();
	static void scanBayerMinMax(uint16_t * data, int w, int h, uint16_t & min, uint16_t & max);
	static void scanPlaneMinMax(uint16_t * data, int w, int h, uint16_t & min, uint16_t & max);

	/* ==== functions for usage ==== */
	uint32_t findFirstWithAtLeast(uint32_t wantedCount) const;
	uint32_t getLevel(double v) const;

};

struct HistogramStorage {
	int channelCount;

	char datas[0];

	static long int requiredStorage(int w, int h, int channelCount, uint16_t * min, uint16_t * max)
	{
		long int size = 0;
		size += sizeof(HistogramStorage);
		for(int i = 0 ; i < channelCount; ++i)
		{
			size += sizeof(HistogramChannelData);
			if (max[i] >= min[i]) {
				size += sizeof(uint32_t) * ((uint32_t)max[i] - (uint32_t)min[i]  + 1);
			}
		}
		return size;
	}

	void init(int w, int h, int channelCount, uint16_t * min, uint16_t * max)
	{
		for(int i = 0; i < channelCount; ++i) {
			HistogramChannelData * ch = channel(i);
			ch->min = min[i];
			ch->max = max[i];
		}
	}

	HistogramChannelData * channel(int ch)
	{
		int currentId = 0;
		char * ptr = datas;
		HistogramChannelData * current = (HistogramChannelData*)ptr;
		while(currentId < ch) {

			ptr += sizeof(HistogramChannelData);
			ptr += sizeof(uint32_t) * current->sampleCount();
			current = (HistogramChannelData*)ptr;
			currentId++;
		}
		return current;
	}
};

#endif
