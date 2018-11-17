#include <dirent.h>
#include <unistd.h>
#include <string.h>
#include "TempDir.h"

#include "SharedCacheServer.h"

static std::string createTempDir(const std::string & baseName)
{
    char * tmpdir = getenv("TMPDIR");
    if (tmpdir == nullptr) {
        tmpdir = "/tmp";
    }
    std::string prefix = std::string(tmpdir) + "/" + baseName + "-XXXXXX";
    char buffer[prefix.length() + 1];
    strcpy(buffer, prefix.c_str());
    if (mkdtemp(buffer) == nullptr) {
        throw SharedCache::WorkerError::fromErrno(errno, "Unable to create temp dir");
    }

    return std::string(buffer);
}

static void unlink(const std::string & d)
{
    if (getenv("DEBUG")) {
        return;
    }
    if (unlink(d.c_str()) == -1) {
        if (errno == EISDIR) {
            if (rmdir(d.c_str()) != -1) {
                return;
            }
        }
        perror(d.c_str());
    }
}

TempDir::TempDir(const std::string & ipath): dirPath(createTempDir(ipath))
{}

TempDir::~TempDir() {
    if (!dirPath.empty()) {
        DIR *dir;
        struct dirent *ent;
        if ((dir = opendir (dirPath.c_str())) != NULL) {
            /* print all the files and directories within directory */
            while ((ent = readdir (dir)) != NULL) {
                std::string entName = std::string(ent->d_name);
                if (entName == ".") continue;
                if (entName == "..") continue;
                std::string entPath = dirPath + "/" + entName;
                unlink(entPath);
            }
            closedir (dir);
            unlink(dirPath);
        } else {
            perror(dirPath.c_str());
        }
    }
}

