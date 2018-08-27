#ifndef STARFINDER_H_
#define STARFINDER_H_

#include <functional>
#include <vector>

#include "RawDataStorage.h"
#include "BitMask.h"
#include "ChannelMode.h"
#include "HistogramStorage.h"

struct StarFindResult {
	double x, y;
	double fwhm, stddev;
	double maxFwhm, maxStddev, maxFwhmAngle;
	double minFwhm, minStddev, minFwhmAngle;
	
	
};

class StarFinder {


	const RawDataStorage* content;
	const ChannelMode channelMode;
	const BitMask * excludeMask;
	const int x, y;
	const int windowRadius;
	BitMask star;
public:

	StarFinder(const RawDataStorage * content, ChannelMode channelMode, int x, int y, int windowRadius) :
		content(content), channelMode(channelMode),
		x(x), y(y),
		windowRadius(windowRadius),
		excludeMask(nullptr)
	{
	}

	bool perform(StarFindResult & details);

	void setExcludeMask(const BitMask * bm) {
		excludeMask = bm;
	}

	const BitMask & getStarMask() const {
		return star;
	}
};

#endif

