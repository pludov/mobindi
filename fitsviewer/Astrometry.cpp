#include <unistd.h>

#include "json.hpp"

#include "FitsFile.h"
#include "TempDir.h"
#include "ChildProcess.h"

#include "SharedCacheServer.h"
#include "SharedCache.h"
#include "StarFinder.h"

using namespace std;
using nlohmann::json;

namespace SharedCache {
    namespace Messages {
        void to_json(nlohmann::json&j, const AstrometryResult & i)
        {
            j = nlohmann::json::object();
            j["found"] = i.found;
            j["width"] = i.width;
            j["height"] = i.height;
            if (i.found) {
                j["raCenter"] = i.raCenter;
                j["decCenter"] = i.decCenter;
                j["refPixX"] = i.refPixX;
                j["refPixY"] = i.refPixY;
                j["cd1_1"] = i.cd1_1;
                j["cd1_2"] = i.cd1_2;
                j["cd2_1"] = i.cd2_1;
                j["cd2_2"] = i.cd2_2;
            }
        }

        void from_json(const nlohmann::json& j, AstrometryResult & p)
        {
            p.found = j.at("found").get<bool>();
            p.width = j.at("width").get<int>();
            p.height = j.at("height").get<int>();
            if (p.found) {
                p.raCenter = j.at("raCenter").get<double>();
                p.decCenter = j.at("decCenter").get<double>();
                p.refPixX = j.at("refPixX").get<double>();
                p.refPixY = j.at("refPixY").get<double>();
                p.cd1_1 = j.at("cd1_1").get<double>();
                p.cd1_2 = j.at("cd1_2").get<double>();
                p.cd2_1 = j.at("cd2_1").get<double>();
                p.cd2_2 = j.at("cd2_2").get<double>();
            }
        }
    }
}


class AstrometryProcessor {
public:
    SharedCache::Messages::Astrometry * message;
    SharedCache::Messages::StarFieldResult starfield;

    AstrometryProcessor(SharedCache::Messages::Astrometry * imessage, const std::string & source):message(imessage), starfield(nlohmann::json::parse(source)) {
    }

    void writeStarFieldFits(const std::string & path, const std::string & matchFile, const std::string & corrFile, const std::string & wcsFile) {
        FitsFile file;
        int status = 0;

        file.create(path);

        fits_create_hdu(file.fptr, &status);
        int width = starfield.width;
        int height = starfield.height;

        fits_write_key_log(file.fptr, "SIMPLE", 1, "file does conform to FITS standard", &status);
        fits_write_key_lng(file.fptr, "BITPIX", 8, nullptr, &status);
        fits_write_key_lng(file.fptr, "NAXIS", 0, nullptr, &status);
        fits_write_key_log(file.fptr, "EXTEND", 1, nullptr, &status);
        fits_write_key_lng(file.fptr, "IMAGEW", width, "image width", &status);
        fits_write_key_lng(file.fptr, "IMAGEH", height, "image height", &status);
        fits_write_key_log(file.fptr, "ANRUN", 1, nullptr, &status);

        double diagPixSize = sqrt(width * width + height * height);
        if (this->message->fieldMin > 0) {
            double arcsecMin = this->message->fieldMin * 3600 / diagPixSize;
            // 0.18643190057
            fits_write_key_dbl(file.fptr, "ANAPPL1", arcsecMin, 10, "arcsec/pixel min", &status);
        }

        if (this->message->fieldMax != -1) {
            double arcsecMax = this->message->fieldMax * 3600 / diagPixSize;
            fits_write_key_dbl(file.fptr, "ANAPPU1", arcsecMax, 10, "arcsec/pixel min", &status);
        }

        if (this->message->searchRadius != -1) {
            double realSearchRadius = this->message->searchRadius + (this->message->fieldMax != -1 ? this->message->fieldMax : 0) / 2;
            if (realSearchRadius < 180) {
                fits_write_key_dbl(file.fptr, "ANERA", this->message->raCenterEstimate, 10, "RA center estimate (deg)", &status);
                fits_write_key_dbl(file.fptr, "ANEDEC", this->message->decCenterEstimate, 10, "Dec center estimate (deg)", &status);
                fits_write_key_dbl(file.fptr, "ANERAD", realSearchRadius, 10, "Search radius from estimated posn (deg)", &status);
            }
        }

        fits_write_key_longstr(file.fptr, "ANMATCH", matchFile.c_str(), "match output file", &status);
        fits_write_key_longstr(file.fptr, "ANCORR", corrFile.c_str(), "Correspondences output filename", &status);
        fits_write_key_longstr(file.fptr, "ANWCS", wcsFile.c_str(), "wcs filename", &status);

        char * types[] = { "X", "Y", "FLUX" };
        char * forms[] = { "E", "E", "E" };
        char * units[] = { "pix", "pix", "unknown" };

        fits_create_hdu(file.fptr, &status);
        fits_write_btblhdr(file.fptr, starfield.stars.size(), 3, types, forms, units, "SOURCES", 0, &status); 

        fits_write_key_lng(file.fptr, "IMAGEW", width, "image width", &status);
        fits_write_key_lng(file.fptr, "IMAGEH", height, "image height", &status);

        float * values = new float[starfield.stars.size()];
        for(int col = 1; col <= 3; ++col) {
            for(size_t i = 0; i < starfield.stars.size(); ++i) {
                float v;
                switch(col) {
                    case 1:
                        v = starfield.stars[i].x;
                        break;
                    case 2:
                        v = starfield.stars[i].y;
                        break;
                    case 3:
                        v = starfield.stars[i].flux;
                        break;
                }
                values[i] = v;
            }

            fits_write_col_flt(file.fptr, col, 1, 1, starfield.stars.size(), values, &status);
        }

        delete(values);

        file.close();
    }

    SharedCache::Messages::AstrometryResult readWcs(const std::string & path)
    {
        int bitpix, naxis;
        long naxes[2] = {1,1};

        FitsFile file;
        if (!file.openIfExists(path)) {
            SharedCache::Messages::AstrometryResult result;
            result.found = false;
            result.width = starfield.width;
            result.height = starfield.height;
            return result;
        }

        int status = 0;
        if (fits_get_img_param(file.fptr, 0, &bitpix, &naxis, naxes, &status) )
        {
            file.throwFitsIOError("wrong wcs fits", status);
        }
        if (naxis != 0) {
            throw SharedCache::WorkerError("wrong wcs fits (naxis != 0)");
        }

        long wcaxes;
        if (fits_read_key_lng(file.fptr, "WCSAXES", &wcaxes, nullptr, &status)) {
            file.throwFitsIOError("wrong wcs fits (WCSAXES)", status);
        }
        if (wcaxes != 2) {
            throw SharedCache::WorkerError("wrong wcs fits (WCSAXES != 2)");
        }

        if (file.getDoubleKey("EQUINOX") != 2000) {
            throw SharedCache::WorkerError("unsupported wcs fits (EQUINOX != 2)");
        }

        if (file.getStrKey("CUNIT1") != "deg") {
            throw SharedCache::WorkerError("unsupported wcs fits (CUNIT1 != deg)");
        }
        if (file.getStrKey("CUNIT2") != "deg") {
            throw SharedCache::WorkerError("unsupported wcs fits (CUNIT2 != deg)");
        }

        SharedCache::Messages::AstrometryResult result;

        result.found = true;
        result.raCenter = file.getDoubleKey("CRVAL1");
        result.decCenter = file.getDoubleKey("CRVAL2");
        result.refPixX = file.getDoubleKey("CRPIX1");
        result.refPixY = file.getDoubleKey("CRPIX2");
        result.cd1_1 = file.getDoubleKey("CD1_1");
        result.cd1_2 = file.getDoubleKey("CD1_2");
        result.cd2_1 = file.getDoubleKey("CD2_1");
        result.cd2_2 = file.getDoubleKey("CD2_2");
        result.width = starfield.width;
        result.height = starfield.height;

        return result;
    }

    // FIXME: return the result structure
    nlohmann::json process()
    {
        TempDir tempDir("astrometry");

        std::string inputPath(tempDir.path() + "/input.axy");
        std::string wcsPath(tempDir.path() + "/wcs.fits");
        writeStarFieldFits(inputPath,
                            tempDir.path() + "/match.fits",
                            tempDir.path() + "/corr.fits",
                            wcsPath);

        std::vector<std::string> args;
        args.push_back(inputPath);
        int ecode;
        if ((ecode = system("astrometry-engine", args)) != 0) {
            throw SharedCache::WorkerError("astrometry failed (code " + std::to_string(ecode) + ")");
        }

        return readWcs(wcsPath);
    }
};


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

    AstrometryProcessor processor(this, source);

    j = processor.process();
    std::string t = j.dump();
    entry->allocate(t.size());
    memcpy(entry->data(), t.data(), t.size());
}

