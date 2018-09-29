#include <math.h>

#include "StarFinder.h"

void to_json(nlohmann::json&j, const StarFindResult & i)
{
    j = nlohmann::json::object();
    j["x"] = i.x;
    j["y"] = i.y;
    j["fwhm"] = i.fwhm;
    j["stddev"] = i.stddev;
    j["maxFwhm"] = i.maxFwhm;
    j["maxStddev"] = i.maxStddev;
    j["maxFwhmAngle"] = i.maxFwhmAngle;
    j["minFwhm"] = i.minFwhm;
    j["minStddev"] = i.minStddev;
    j["minFwhmAngle"] = i.minFwhmAngle;
}


bool StarFinder::perform(StarFindResult & result) {
    int x0 = x - windowRadius;
    int y0 = y - windowRadius;
    int x1 = x + windowRadius;
    int y1 = y + windowRadius;
    if (x0 < 0) {
        x0 = 0;
    }
    if (y0 < 0) {
        y0 = 0;
    }
    if (x1 >= content->w) {
        x1 = content->w - 1;
    }
    if (y1 >= content->h) {
        y1 = content->h - 1;
    }
    if (x0 > x1) {
        return false;
    }
    if (y0 > y1) {
        return false;
    }

	std::vector<int> blackLevelByChannel(channelMode.channelCount, 0);
	std::vector<int> blackStddevByChannel(channelMode.channelCount, 0);

    HistogramStorage * hs = HistogramStorage::build(content, x0, y0, x1, y1, [](long int size){return ::operator new(size);});
    for(int ch = 0; ch < channelMode.channelCount; ++ch)
    {
        blackLevelByChannel[ch] = hs->channel(ch)->getLevel(0.4);
        blackStddevByChannel[ch] = ceil(2 * hs->channel(ch)->getStdDev(0, blackLevelByChannel[ch]));
    }
    
    delete(hs);

    std::vector<uint16_t> maxAduByChannel(channelMode.channelCount, 0);

    // On remonte arbitrairement le noir
    for(int i = 0; i < channelMode.channelCount; ++i) {
        blackLevelByChannel[i] += blackStddevByChannel[i];
    }

    int maxRelAdu = 0;
    int maxAduX = this->x, maxAduY = this->y;

    // Calcul des pixels non noirs
    BitMask notBlack(x0, y0, x1, y1);
    for(int y = y0; y <= y1; ++y)
        for(int x = x0; x <= x1; ++x)
        {
            int adu = content->getAdu(x, y);
            int channelId = this->channelMode.getChannelId(x, y);
            if (adu > blackLevelByChannel[channelId]) {
                maxAduByChannel[channelId] = adu;
                adu -= blackLevelByChannel[channelId];
                if (adu >= maxRelAdu) {
                    maxAduX = x;
                    maxAduY = y;
                    maxRelAdu = adu;
                }
                notBlack.set(x, y, 1);
            }
        }

    if (excludeMask != nullptr) {
        notBlack.substract(*excludeMask);
    }

    BitMask notBlackEroded(notBlack);
    notBlackEroded.erode();
    notBlackEroded.grow();
    if (excludeMask != nullptr) {
        notBlackEroded.substract(*excludeMask);
    }

    if (!notBlackEroded.get(maxAduX, maxAduY)) {
        // Rien trouvé
        return false;
    }

    // On marque le centre
    star = BitMask(x0, y0, x1, y1);
    star.set(maxAduX, maxAduY, 1);
    star.grow(notBlackEroded);

    star.grow();
    if (excludeMask != nullptr) star.substract(*excludeMask);
    star.grow();
    if (excludeMask != nullptr) star.substract(*excludeMask);
    star.grow();
    if (excludeMask != nullptr) star.substract(*excludeMask);
    
    int64_t xSum = 0;
    int64_t ySum = 0;
    int64_t aduSum = 0;
    
    for(BitMaskIterator it = star.iterator(); it.next();)
    {
        int x = it.x();
        int y = it.y();

        int channelId = channelMode.getChannelId(x, y);
        int adu = content->getAdu(x, y);
        // en cas d'utilisation de black, on fait en sorte de garder saturé les pixels saturés

        int black = blackLevelByChannel[channelId];
        if (adu <= black) continue;
        adu -= black;
/*        this->aduSumByChannel[channelId] += adu;
        if (adu > this->aduMaxByChannel[channelId]) {
            this->aduMaxByChannel[channelId] = adu;
        }*/

        xSum += x * adu;
        ySum += y * adu;
        aduSum += adu;
    }

    if (aduSum <= 0) {
        return false;
    }



    double picX = xSum * 1.0 / aduSum;
    double picY = ySum * 1.0 / aduSum;

    double maxAngle = 0, minAngle = 0;
    double maxFwhm = 0, minFwhm = 0;
    double fwhmSum = 0;
    int stepCount = 128;
    for(int step = 0; step < stepCount; ++step)
    {
        double angle = step * M_PI / stepCount;
    
        double cs = cos(angle);
        double sn = sin(angle);
        
        double sumDstSquare = 0;
        double sumDstSquareDivider = 0;
    
        // MedianCalculator medianCalculator = new MedianCalculator();
        
        // on veut le x moyen tel que :
        //    Centerx = somme(x.adu) / somme(adu)
        // Et après l'écart type:
        //    Stddev = somme(adu.(x - centerx)) / somme(adu)
        for(BitMaskIterator it = star.iterator(); it.next();)
        {
            int x = it.x();
            int y = it.y();

            int adu = content->getAdu(x, y);
            int black = blackLevelByChannel[channelMode.getChannelId(x, y)];

            if (adu <= black) continue;
            adu -= black;

            double dx = (x - picX);
            double dy = (y - picY);
            double dst = cs * dx + sn * dy;

//					double dst = cs * (x - 2 * picX) * cs * (x - 2 * picX) +
//							sn * (y - 2 * picY) * sn * (y - 2 * picY);

            // medianCalculator.addEntry(adu, dst);
            double adus = adu;
            sumDstSquare += adus * dst * dst;
            sumDstSquareDivider += adus;
        }

        double stddev = sqrt(sumDstSquare / sumDstSquareDivider);
        // double meandev = Math.sqrt(medianCalculator.getMedian());
        // logger.info("found stddev = " + stddev + "  meandev = " + meandev);
        double fwhm = 2.35 * stddev;

        if (step == 0 || fwhm > maxFwhm)
        {
            maxFwhm = fwhm;
            maxAngle = angle;
        }

        if (step == 0 || fwhm < minFwhm)
        {
            minFwhm = fwhm;
            minAngle = angle;
        }

        fwhmSum += fwhm;
    }

    result.x = picX;
    result.y = picY;
    result.fwhm = fwhmSum / stepCount;
    result.stddev = result.fwhm / 2.35;

    result.maxFwhm = maxFwhm;
    result.maxStddev = maxFwhm / 2.35;
    result.maxFwhmAngle = maxAngle;
    result.minFwhm = minFwhm;
    result.minStddev = minFwhm / 2.35;
    result.minFwhmAngle = minAngle;

    return true;
}