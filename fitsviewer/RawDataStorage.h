#ifndef RAWDATASTORAGE_H
#define RAWDATASTORAGE_H 1

#include <string>

struct RawDataStorage {
	int w, h; 		// naxes[0], naxes[1]
	uint8_t bitpix;	// 8 or 16
	char bayer[4];
	uint16_t data[0];

	// Empty for grayscale. pattern in the form RGGB otherwise
	std::string getBayer() const;
	bool hasColors() const;

	void setSize(int w, int h);
	void setBayer(const std::string & bayer);
	void setBitPix(uint8_t bitpix);

	uint16_t getAdu(int x, int y) const {
		return data[x + y * w];
	}

	void setAdu(int x, int y, uint16_t adu) {
		data[x + y * w] = adu;
	}

	static long int requiredStorage(int w, int h);

	static int getRGBIndex(char c);
};


#endif
