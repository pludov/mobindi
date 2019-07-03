#include "Stream.h"
#include "SharedCacheServerClient.h"

namespace SharedCache {

    Stream::Stream(const std::string & id, Client * producer):
            producer(producer),
            id(id),
            serial(0),
            latest(nullptr)
    {
        latestSerial = 0;
    }

    Stream::~Stream() {
        if (latest != nullptr) {
            latest->removeReader();
            latest =nullptr;
        }
    }

    CacheFileDesc * Stream::newCacheEntry()
    {
        this->serial++;

        Messages::ContentRequest contentRequest;
        contentRequest.fitsContent.build();
        contentRequest.fitsContent->exactSerial = true;
        contentRequest.fitsContent->serial = this->serial;
        contentRequest.fitsContent->stream = this->id;

        std::string identifier = contentRequest.uniqKey();

        auto ret = new CacheFileDesc(producer->getServer(),
                            identifier,
                            producer->getServer()->newFilename());

        ret->serial = this->serial;
        return ret;
    }

    void Stream::setLatest(CacheFileDesc * cfd) {
        if (latest != nullptr) {
            latest->removeReader();
        }
        latest = cfd;
        latestSerial = cfd->serial;
        cfd->addReader();
    }
}

