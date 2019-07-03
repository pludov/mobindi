#include "Stream.h"
#include "SharedCacheServerClient.h"

namespace SharedCache {

    Stream::Stream(const std::string & id, Client * producer):
            producer(producer),
            id(id),
            serial(0),
            latest(nullptr)
    {
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

        return new CacheFileDesc(producer->getServer(),
                            identifier,
                            producer->getServer()->newFilename());
    }

    void Stream::setLatest(CacheFileDesc * cfd) {
        if (latest != nullptr) {
            latest->removeReader();
        }
        latest = cfd;
        cfd->addReader();
    }
}

