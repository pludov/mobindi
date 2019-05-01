#include <stdexcept>
#include "FitsFile.h"
#include "SharedCacheServer.h"

FitsFile::FitsFile()
{
    fptr = nullptr;
}

FitsFile::~FitsFile() {
    if (fptr) {
        int status = 0;
        if (isnew) {
            fits_delete_file(fptr, &status);
        } else {
            fits_close_file(fptr, &status);
        }
        fptr = nullptr;
    }
}

void FitsFile::close() {
   if (fptr) {
        int status = 0;
        fits_close_file(fptr, &status);
        fptr = nullptr;
    }
}

void FitsFile::create(const std::string & path) {
    if (fptr) {
        throw std::runtime_error("fits already opened");
    }
    int status = 0;
    isnew = true;
    if (fits_create_file(&fptr, path.c_str(), &status)) {
        throwFitsIOError(std::string("unable to write : ") + path, status);
    }
}

void FitsFile::open(const std::string & path) {
    if (fptr) {
        throw std::runtime_error("fits already opened");
    }
    isnew = false;
    int status = 0;
	if (fits_open_file(&fptr, path.c_str(), READONLY, &status)) {
        throwFitsIOError(std::string("unable to open : ") + path, status);
    }
}

bool FitsFile::openIfExists(const std::string & path) {
    if (fptr) {
        throw std::runtime_error("fits already opened");
    }
    int status = 0;
	if (fits_open_file(&fptr, path.c_str(), READONLY, &status)) {
        fptr = nullptr;
        return false;
    }
    isnew = false;
    return true;
}

double FitsFile::getDoubleKey(const std::string & key) {

    int status = 0;
    double equinox;
    if (fits_read_key_dbl(fptr, key.c_str(), &equinox, nullptr, &status)) {
        FitsFile::throwFitsIOError(std::string("problem with key") + key, status);
    }
    return equinox;
}

std::string FitsFile::getStrKey(const std::string & key) {
    int status = 0;
    char keyvalue[FLEN_VALUE+1];

    if (fits_read_key_str(fptr, key.c_str(), keyvalue, nullptr, &status)) {
        FitsFile::throwFitsIOError(std::string("problem with key") + key, status);
    }
    keyvalue[FLEN_VALUE] = 0;
    return std::string(keyvalue);
}

void FitsFile::throwFitsIOError(const std::string & text, int status)
{
	char buffer[128];
	fits_get_errstatus(status, buffer);
	throw SharedCache::WorkerError(text + ": " + std::string(buffer));
}

