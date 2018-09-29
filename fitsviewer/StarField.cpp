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
#include "SharedCacheServer.h"
#include "RawDataStorage.h"
#include "HistogramStorage.h"
#include "LookupTable.h"
#include "BitMask.h"
#include "ChannelMode.h"
#include "StarFinder.h"

using namespace std;
using namespace cgicc;

using nlohmann::json;


class StarCandidate {
	friend class MultiStarFinder;

	std::shared_ptr<vector<int>> area;

	double weight, cx, cy;
	double stddev;
public:
	StarCandidate(const std::shared_ptr<vector<int>> & area,
					double weight, double stddev,
					double cx, double cy)
		: area(area), weight(weight), cx(cx), cy(cy), stddev(stddev)
	{
	}
};


class MultiStarFinder {
	friend class StarFinder;
	RawDataStorage * content;
	HistogramStorage * histogram;
	const ChannelMode channelMode;
public:

	MultiStarFinder(RawDataStorage * content, HistogramStorage * histogram)
		: channelMode(content->hasColors() ? 4 : 1)
	{
		this->content = content;
		this->histogram = histogram;
	}

	int getChannelId(int x, int y)
	{
		if (channelMode.channelCount == 1) return 0;
		return (x & 1) + (y & 1);
	}

	std::vector<StarFindResult> proceed(int maxCount) {
		int blackLevelByChannel[channelMode.channelCount];
		int blackStddevByChannel[channelMode.channelCount];

		for(int channel = 0; channel < channelMode.channelCount; ++channel)
		{
			HistogramChannelData * channelHistogram = histogram->channel(channel);
			int black = channelHistogram->getLevel(0.6);;
			blackLevelByChannel[channel] = black;
			blackStddevByChannel[channel] = (int)ceil(2 * channelHistogram->getStdDev(0, black));
		}


		int limitByChannel[channelMode.channelCount];
		for(int i = 0; i < channelMode.channelCount; ++i)
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

		BitMask tmp(notBlack);
		notBlack.erode();
		notBlack.erode();
		notBlack.grow();
		notBlack.grow();

		// Ensuite, chaque zone de connexité représente une étoile potentielle.
		//  - on les trie par energie
		//  - on les parcours
		//  - si le nombre d'étoiles autours de la zone considérée est inferieur à la moyenne, considérer la zone
		auto zones = notBlack.calcConnexityGroups();

		// Taille maxi d'une étoile (32 x 32)
		int maxSurface = 2048;
		double maxStddev = 8;

		std::vector<std::shared_ptr<StarCandidate>> stars;
		for(auto zone : zones)
		{
			if (zone->size() > maxSurface) {
				continue;
			}

			int adusum = 0;
			double xmoy = 0;
			double ymoy = 0;
			for(int i = 0; i < zone->size(); i += 2)
			{
				int x = (*zone)[i];
				int y = (*zone)[i + 1];

				int v = content->getAdu(x, y);
				v -= limitByChannel[getChannelId(x, y)];
				if (v < 0) {
					continue;
				}
				// FIXME : retirer le black et l'estimation du fond !
				xmoy += v * x;
				ymoy += v * y;
				adusum += v;
			}

			if (adusum == 0) {
				continue;
			}
			xmoy /= adusum;
			ymoy /= adusum;

			double stddevVal = 0;

			for(int i = 0; i < zone->size(); i += 2)
			{
				int x = (*zone)[i];
				int y = (*zone)[i + 1];

				int v = content->getAdu(x, y);
				v -= limitByChannel[getChannelId(x, y)];

				if (v < 0) {
					continue;
				}

				// FIXME : retirer le black et l'estimation du fond !

				double dst  = (x - xmoy) * (x - xmoy) + (y - ymoy) * (y - ymoy);
				stddevVal += v * dst;
			}

			stddevVal /= adusum;

			if (stddevVal > maxStddev * maxStddev) {
				continue;
			}
			auto candidate = std::make_shared<StarCandidate>(zone,
						adusum, sqrt(stddevVal),
						xmoy, ymoy);

			stars.push_back(candidate);
		}

		std::sort(stars.begin(), stars.end(),
				[](const shared_ptr<StarCandidate> & a, const shared_ptr<StarCandidate> & b) -> bool {
					return a->weight > b->weight;
				});

		int cpt = 0;
		BitMask checkedArea(0, 0, content->w - 1, content->h - 1);

		int left = maxCount;
		std::vector<StarFindResult> resultVec;
		resultVec.reserve(maxCount);
		for(const auto & star : stars)
		{
			cout << star->weight << " at " << star->cx << "  " << star->cy << "\n" ;
			StarFinder sf(content, channelMode, star->cx, star->cy, 25);
			sf.setExcludeMask(&checkedArea);
			StarFindResult result;
			if (sf.perform(result)) {
				cout << result.x << "\t" << result.y << "\t=> " << result.fwhm << "\n";
				resultVec.push_back(result);
				maxCount--;
				if (maxCount <= 0) {
					break;
				}
			}
		}

		std::vector<double> fwhm;
		for(int i = 0; i < resultVec.size(); ++i) {
			fwhm.push_back(resultVec[i].fwhm);
		}
		std::sort(fwhm.begin(), fwhm.end(),
				[](double a, double b) -> bool {
					return a > b;
				});
		int fwhmCpt = 0;
		double fwhmSum = 0;
		for(int i = (int)ceil(fwhm.size() * 0.2); i < (int)floor(fwhm.size() * 0.8); ++i)
		{
			fwhmCpt++;
			fwhmSum += fwhm[i];
		}
		if (fwhmCpt > 0) {
			cerr << "Median FWHM : " << (fwhmSum / fwhmCpt) << "\n";
		}

		return resultVec;
	}

};

void SharedCache::Messages::StarField::produce(SharedCache::Entry* entry)
{
	SharedCache::Messages::ContentRequest contentRequest;
	contentRequest.fitsContent = new SharedCache::Messages::RawContent(source);
	SharedCache::EntryRef aduPlane(entry->getServer()->getEntry(contentRequest));
	if (aduPlane->hasError()) {
        aduPlane->release();
		throw WorkerError(std::string("Source error : ") + aduPlane->getErrorDetails());
	}
	RawDataStorage * contentStorage = (RawDataStorage *)aduPlane->data();

	SharedCache::Messages::ContentRequest histogramRequest;
	histogramRequest.histogram = new SharedCache::Messages::Histogram();
	histogramRequest.histogram->source = SharedCache::Messages::RawContent(source);
	SharedCache::EntryRef histogram(entry->getServer()->getEntry(histogramRequest));
    if (histogram->hasError()) {
        histogram->release();
        aduPlane->release();
        throw WorkerError(std::string("Source error : ") + histogram->getErrorDetails());
    }

	HistogramStorage * histogramStorage = (HistogramStorage*)histogram->data();
	MultiStarFinder msf(contentStorage, histogramStorage);
	auto result = msf.proceed(200);

    json j = result;
    std::string t = j.dump();
    entry->allocate(t.size());
    memcpy(entry->data(), t.data(), t.size());
    
    // strcpy((char*)entry->data(), "{\"value\":42.42}");

}



