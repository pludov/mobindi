#ifndef RAWDATASTORAGE_H
#define RAWDATASTORAGE_H 1

#include <string>

struct RawDataStorage {
	int w, h; 		// naxes[0], naxes[1]
	char bayer[4];
	uint16_t data[0];

	// Empty for grayscale. pattern in the form RGGB otherwise
	std::string getBayer() const;
	bool hasColors() const;

	void setSize(int w, int h);
	void setBayer(const std::string & bayer);

	uint16_t getAdu(int x, int y) {
		return data[x + y * w];
	}

	static long int requiredStorage(int w, int h);

	static int getRGBIndex(char c);
};


#endif
