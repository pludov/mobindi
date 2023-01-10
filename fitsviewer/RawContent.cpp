#include "FitsFile.h"
#include "SharedCache.h"
#include "SharedCacheServer.h"
#include "RawDataStorage.h"


std::string RawDataStorage::getBayer() const {
	if (bayer[0] == 0) {
		return "";
	}
	return std::string(bayer, 4);
}

bool RawDataStorage::hasColors() const {
	return bayer[0] != 0;
}

void RawDataStorage::setSize(int w, int h)
{
	this->w = w;
	this->h = h;
}

void RawDataStorage::setBayer(const std::string & str)
{
	if (str.length() == 0) {
		bayer[0] = 0;bayer[1] = 0;bayer[2] = 0;bayer[3] = 0;
	} else {
		bayer[0] = str[0];
		bayer[1] = str[1];
		bayer[2] = str[2];
		bayer[3] = str[3];
	}
}

void RawDataStorage::setBitPix(uint8_t bitpix)
{
	this->bitpix = bitpix;
}

long int RawDataStorage::requiredStorage(int w, int h)
{
	return sizeof(RawDataStorage) + (sizeof(uint16_t) * w * h);
}

static bool readKey(fitsfile * fptr, const std::string & key, std::string * o_value)
{
	char comment[128];
	char * value = NULL;
	int status = 0;
	fits_read_key_longstr(fptr, key.c_str(), &value, comment, &status);
	// FIXME check of status == KEY_NO_EXIST
	if (status > 0) return false;
	if (value == NULL) return false;
	(*o_value) = std::string(value);
	free(value);
	return true;

}

int RawDataStorage::getRGBIndex(char c)
{
	switch(c) {
		case 'R':
			return 0;
		case 'G':
			return 1;
		case 'B':
			return 2;
	}
	return -1;
}

void SharedCache::Messages::RawContent::readFits(FitsFile & file, WriteableEntry * entry)
{
	int status = 0;
	int bitpix, naxis;
	long naxes[2] = {1,1};
	u_int16_t * data;

	if (!fits_get_img_param(file.fptr, 2, &bitpix, &naxis, naxes, &status) )
	{
		fprintf(stderr, "bitpix = %d\n", bitpix);
		fprintf(stderr, "naxis = %d\n", naxis);
		if (naxis != 2) {
			throw SharedCache::WorkerError("unsupported axis count");
		} else {
			fprintf(stderr, "size=%ldx%ld\n", naxes[0], naxes[1]);

		}

		int w = naxes[0];
		int h = naxes[1];

		int hdupos = 1;
		int nkeys;
		char card[FLEN_CARD];
		std::string bayer = "";
		std::string cardBAYERPAT;
		for (; !status; hdupos++)  /* Main loop through each extension */
		{
			fits_get_hdrspace(file.fptr, &nkeys, NULL, &status); /* get # of keywords */

			fprintf(stderr, "Header listing for HDU #%d:\n", hdupos);

			for (int ii = 1; ii <= nkeys; ii++) { /* Read and print each keywords */

				if (fits_read_record(file.fptr, ii, card, &status))break;
				fprintf(stderr, "%s\n", card);
			}
			fprintf(stderr, "END\n\n");  /* terminate listing with END */

			if (readKey(file.fptr, "BAYERPAT", &bayer) && bayer.size() > 0) {
				fprintf(stderr, "BAYER detected");
			}
			// fits_movrel_hdu(file.fptr, 1, NULL, &status);  /* try to move to next HDU */
			break;
		}

		status = 0;
		if (bayer.size() > 0) {
			if (bayer.size() != 4) {
				fprintf(stderr, "Ignoring bayer pattern: %s\n", bayer.c_str());
				bayer = "";
			} else {
				bool valid = true;
				for(int i = 0; i < 4; ++i) {
					if (RawDataStorage::getRGBIndex(bayer[i]) == -1) {
						valid = false;
						break;
					}
				}
				if (!valid) {
					fprintf(stderr, "Ignoring bayer pattern: %s\n", bayer.c_str());
					bayer = "";
				}
			}
		}

		entry->allocate(RawDataStorage::requiredStorage(w, h));
		RawDataStorage * storage = (RawDataStorage*)entry->data();

		storage->setSize(w, h);
		storage->setBayer(bayer);
		switch(bitpix) {
			case BYTE_IMG:
				storage->setBitPix(8);
			case SHORT_IMG:
			default:
				storage->setBitPix(16);
		}


		long fpixels[2]= {1,1};
		if (bitpix < 0) {
			fprintf(stderr, "Scaling float pixels\n");
			// Assume float are in the range 0 - 1
			float * temp = (float*)malloc(w * h * sizeof(float));
			
			if (!fits_read_pix(file.fptr, TFLOAT, fpixels, naxes[0] * naxes[1], NULL, temp, NULL, &status)) {
				for(int i = 0; i < w*h; ++i) {
					float f = temp[i] * 65535;
					if (f < 0) f = 0;
					if (f > 65535) f = 65535;
					storage->data[i] = f;
				}

				free(temp);
				return;
			}

			free(temp);
		} else {
			if (!fits_read_pix(file.fptr, TUSHORT, fpixels, naxes[0] * naxes[1], NULL, &storage->data, NULL, &status)) {
				return;
			}
		}


		file.throwFitsIOError("fits_read_pix failed", status);

	} else {
		file.throwFitsIOError("fits_get_img_param", status);
	}

}

void SharedCache::Messages::RawContent::produce(WriteableEntry * entry)
{
	FitsFile file;
	file.open(path.c_str());

	readFits(file, entry);
}

