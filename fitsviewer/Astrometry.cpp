
#include "json.hpp"
#include "fitsio.h"

#include "SharedCacheServer.h"
#include "SharedCache.h"
#include "StarFinder.h"
#include "Astrometry.h"

using namespace std;
using nlohmann::json;


class OpenedFits {
public:
	fitsfile * fptr;

	OpenedFits() {
		fptr = nullptr;
	}

	~OpenedFits() {
		if (fptr) {
			int status = 0;
			fits_close_file(fptr, &status);
		}
	}
};

void SharedCache::Messages::Astrometry::writeStarFieldFits(const std::string & path, const std::vector<StarFindResult> & starfield) {
    OpenedFits file;
    int status = 0;

	if (!fits_create_file(&file.fptr, path.c_str(), &status)) {
        fits_create_hdu(file.fptr, &status);
        int width = 4290;
        int height = 2856;

        fits_write_key_log(file.fptr, "SIMPLE", 1, "file does conform to FITS standard", &status);
        fits_write_key_lng(file.fptr, "BITPIX", 8, nullptr, &status);
        fits_write_key_lng(file.fptr, "NAXIS", 0, nullptr, &status);
        fits_write_key_log(file.fptr, "EXTEND", 1, nullptr, &status);
        fits_write_key_lng(file.fptr, "IMAGEW", width, "image width", &status);
        fits_write_key_lng(file.fptr, "IMAGEH", height, "image height", &status);
        fits_write_key_log(file.fptr, "ANRUN", 1, nullptr, &status);

        double diagPixSize = sqrt(width * width + height * height);
        if (this->fieldMin > 0) {
            double arcsecMin = this->fieldMin * 3600 / diagPixSize;
            // 0.18643190057
            fits_write_key_dbl(file.fptr, "ANAPPL1", arcsecMin, 10, "arcsec/pixel min", &status);
        }

        if (this->fieldMax != -1) {
            double arcsecMax = this->fieldMax * 3600 / diagPixSize;
            fits_write_key_dbl(file.fptr, "ANAPPU1", arcsecMax, 10, "arcsec/pixel min", &status);
        }

        if (this->searchRadius != -1) {
            double realSearchRadius = this->searchRadius + (this->fieldMax != -1 ? this->fieldMax : 0) / 2;
            if (realSearchRadius < 180) {
                fits_write_key_dbl(file.fptr, "ANERA", this->raCenterEstimate, 10, "RA center estimate (deg)", &status);
                fits_write_key_dbl(file.fptr, "ANEDEC", this->decCenterEstimate, 10, "Dec center estimate (deg)", &status);
                fits_write_key_dbl(file.fptr, "ANERAD", realSearchRadius, 10, "Search radius from estimated posn (deg)", &status);
            }
        }

        fits_write_key_longstr(file.fptr, "ANMATCH", "/tmp/anmatch.fits", "match output file", &status);
        fits_write_key_longstr(file.fptr, "ANCORR", "/tmp/ANCORR.fits", "Correspondences output filename", &status);
        fits_write_key_longstr(file.fptr, "ANWCS", "/tmp/ANWCS.fits", "wcs filename", &status);

        char * types[] = { "X", "Y", "FLUX" };
        char * forms[] = { "E", "E", "E" };
        char * units[] = { "pix", "pix", "unknown" };

        fits_create_hdu(file.fptr, &status);
        fits_write_btblhdr(file.fptr, starfield.size(), 3, types, forms, units, "SOURCES", 0, &status); 

        fits_write_key_lng(file.fptr, "IMAGEW", width, "image width", &status);
        fits_write_key_lng(file.fptr, "IMAGEH", height, "image height", &status);

        float * values = new float[starfield.size()];
        for(int col = 1; col <= 3; ++col) {
            for(size_t i = 0; i < starfield.size(); ++i) {
                float v;
                switch(col) {
                    case 1:
                        v = starfield[i].x;
                        break;
                    case 2:
                        v = starfield[i].y;
                        break;
                    case 3:
                        v = starfield[i].flux;
                        break;
                }
                values[i] = v;
            }

            fits_write_col_flt(file.fptr, col, 1, 1, starfield.size(), values, &status);
        }

        delete(values);
    }
}

void SharedCache::Messages::Astrometry::produce(SharedCache::Entry* entry)
{
    json j;

	SharedCache::Messages::ContentRequest contentRequest;
	contentRequest.jsonQuery = new SharedCache::Messages::JsonQuery();
    contentRequest.jsonQuery->starField = new SharedCache::Messages::StarField(source);
	SharedCache::EntryRef starField(entry->getServer()->getEntry(contentRequest));
	if (starField->hasError()) {
        starField->release();
		throw WorkerError(std::string("Source error : ") + starField->getErrorDetails());
	}
	RawDataStorage * contentStorage = (RawDataStorage *)starField->data();
    std::string source((const char*)starField->data(), starField->size());

    j = nlohmann::json::parse(source);
    std::vector<StarFindResult> starFieldData = j;

    writeStarFieldFits("/tmp/plop.fits", starFieldData);
    j = starFieldData;
    std::string t = j.dump();
    entry->allocate(t.size());
    memcpy(entry->data(), t.data(), t.size());
}

