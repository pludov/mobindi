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

	const int x, y;
	const int windowRadius;

public:

	StarFinder(const RawDataStorage * content, ChannelMode channelMode, int x, int y, int windowRadius) :
		content(content), channelMode(channelMode),
		x(x), y(y),
		windowRadius(windowRadius)
	{
	}

	bool perform(StarFindResult & details);
};

#endif

