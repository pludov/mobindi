#ifndef TEMPDIR_H_
#define TEMPDIR_H_

#include <string>

class TempDir {
    std::string dirPath;

public:

    TempDir(const std::string & baseName);
    ~TempDir();

    const std::string & path() const {
        return dirPath;
    }
};


#endif
