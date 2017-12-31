#ifndef RAWDATASTORAGE_H
#define RAWDATASTORAGE_H 1

#include <string>

struct RawDataStorage {
	int w, h; 		// naxes[0], naxes[1]
	char bayer[4];
	uint16_t data[0];

	// Empty for grayscale. pattern in the form RGGB otherwise
	std::string getBayer() const;

	void setSize(int w, int h);
	void setBayer(const std::string & bayer);


	static long int requiredStorage(int w, int h);

	static int getRGBIndex(char c);
};


#endif
