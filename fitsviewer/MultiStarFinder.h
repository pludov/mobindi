#ifndef MULTISTARFINDER_H_
#define MULTISTARFINDER_H_

#include <functional>
#include <vector>

#include <vector>

#include "SharedCache.h"
#include "RawDataStorage.h"
#include "HistogramStorage.h"
#include "ChannelMode.h"
#include "BitMask.h"

class StarCandidate {
	friend class MultiStarFinder;

	std::shared_ptr<std::vector<int>> area;

	double weight, cx, cy;
	double stddev;
public:
	StarCandidate(const std::shared_ptr<std::vector<int>> & area,
					double weight, double stddev,
					double cx, double cy);
};

class MultiStarFinder {
	friend class StarFinder;
	const RawDataStorage * content;
	const HistogramStorage * histogram;
	const ChannelMode channelMode;
protected:
    virtual void onStarmaskComputed(const BitMask & starMask);

public:
	using StarOccurence=SharedCache::Messages::StarOccurence;

	MultiStarFinder(const RawDataStorage * content, const HistogramStorage * histogram);
    virtual ~MultiStarFinder();

	std::vector<StarOccurence> proceed(int maxCount);
};

#endif // MULTISTARFINDER_H_