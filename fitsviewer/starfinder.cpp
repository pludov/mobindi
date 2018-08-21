#include <iostream>
#include <vector>
#include <unistd.h>
#include <cstdint>
#include <stdio.h>
#include <sys/uio.h>
#include <cgicc/CgiDefs.h>
#include <cgicc/Cgicc.h>
#include <cgicc/HTTPResponseHeader.h>
#include <cgicc/HTTPContentHeader.h>
#include <cgicc/HTMLClasses.h>

#include <zlib.h>
#include <stdio.h>

#include "json.hpp"
#include "fitsio.h"
#include "SharedCache.h"
#include "RawDataStorage.h"
#include "HistogramStorage.h"
#include "LookupTable.h"
#include "BitMask.h"

using namespace std;
using namespace cgicc;

using nlohmann::json;



class MultiStarFinder {
	RawDataStorage * content;
	HistogramStorage * histogram;
	int channelCount;
public:

	MultiStarFinder(RawDataStorage * content, HistogramStorage * histogram)
	{
		this->content = content;
		this->histogram = histogram;
		this->channelCount = content->hasColors() ? 4 : 1;
	}

	int getChannelId(int x, int y)
	{
		if (channelCount == 1) return 0;
		return (x & 1) + (y & 1);
	}

	void proceed() {
		int blackLevelByChannel[channelCount];
		int blackStddevByChannel[channelCount];
		

		for(int channel = 0; channel < channelCount; ++channel)
		{
			HistogramChannelData * channelHistogram = histogram->channel(channel);
			int black = channelHistogram->getLevel(0.6);;
			blackLevelByChannel[channel] = black;
			blackStddevByChannel[channel] = (int)ceil(2 * channelHistogram->getStdDev(0, black));
		}


		int limitByChannel[channelCount];
		for(int i = 0; i < channelCount; ++i)
		{
			limitByChannel[i] = blackStddevByChannel[i] + blackLevelByChannel[i];

			cerr << "channel " << i << " black at " << blackLevelByChannel[i] << " limit at " << limitByChannel[i] <<"\n";
		}

		BitMask notBlack(0, 0, content->w - 1, content->h - 1);
		int ptr = 0;
		for(int y = 0; y < content->h; ++y)
			for(int x = 0; x < content->w; ++x)
				if (content->data[ptr++] > limitByChannel[getChannelId(x, y)]) {
					notBlack.set(x, y, 1);
				}

		notBlack.erode();
		notBlack.erode();
		notBlack.grow();
		notBlack.grow();

		notBlack.calcConnexityGroups();
	}

};

int main (int argc, char ** argv) {
	Cgicc formData;
	// 128Mo cache
	SharedCache::Cache * cache = new SharedCache::Cache("/tmp/fitsviewer.cache", 128*1024*1024);


	SharedCache::Messages::ContentRequest contentRequest;
	contentRequest.fitsContent = new SharedCache::Messages::RawContent();
	contentRequest.fitsContent->path = "/home/ludovic/Astronomie/Photos/2018/2018-08-10/IMAGE_116.fits";

	SharedCache::EntryRef aduPlane(cache->getEntry(contentRequest));
	if (aduPlane->hasError()) {
		cerr << aduPlane->getErrorDetails();
		//sendHttpHeader(cgicc::HTTPResponseHeader("HTTP/1.1", 500, aduPlane->getErrorDetails().c_str()));
		exit(1);
	}
	RawDataStorage * contentStorage = (RawDataStorage *)aduPlane->data();

	SharedCache::Messages::ContentRequest histogramRequest;
	histogramRequest.histogram = new SharedCache::Messages::Histogram();
	histogramRequest.histogram->source.path = contentRequest.fitsContent->path;

	SharedCache::EntryRef histogram(cache->getEntry(histogramRequest));

	HistogramStorage * histogramStorage = (HistogramStorage*)histogram->data();


	MultiStarFinder msf(contentStorage, histogramStorage);
	msf.proceed();
}
