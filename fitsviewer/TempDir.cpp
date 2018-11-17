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

TempDir::TempDir(const std::string & ipath): dirPath(createTempDir(ipath))
{}

TempDir::~TempDir() {
    if (!dirPath.empty()) {
        throw std::runtime_error("not implemented");
    }
}

