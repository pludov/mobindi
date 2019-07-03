#ifndef FITSFILE_H_
#define FITSFILE_H_

#include <string>
#include "fitsio.h"

class FitsFile {
    bool isnew;

	void * data;
	size_t dataSize;
public:
	fitsfile * fptr;

	FitsFile();
	~FitsFile();

    void open(const std::string & path);
    bool openIfExists(const std::string & path);
    void create(const std::string & path);

	void openMemory(void * buffer, size_t len);

    // Error if not found
    std::string getStrKey(const std::string & key);
    double getDoubleKey(const std::string & key);

    void close();

	// OpenedFits(const std::string & path) {
	// 	fptr = nullptr;
	// }

	// ~OpenedFits() {
	// 	if (fptr) {
	// 		int status = 0;
	// 		fits_close_file(fptr, &status);
	// 	}
	// }
    
    [[ noreturn ]] void throwFitsIOError(const std::string & text, int status);
};

#endif
