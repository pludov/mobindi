#include <sys/types.h>
#include <sys/stat.h>
#include <sys/wait.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <poll.h>
#include <sys/ioctl.h>
#include <stdint.h>
#include <signal.h>
#include <assert.h>
#include <iostream>
#include <dirent.h>

#include "SharedCacheServerClient.h"

namespace SharedCache {

    void CacheFileDesc::unlink()
    {
        std::string path = server->basePath + filename;
        if (::unlink(path.c_str()) == -1) {
            perror(path.c_str());
        }
        server->contentByFilename.erase(filename);
        filename = "";
    }
}
