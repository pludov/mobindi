#ifndef SHAREDCACHESTREAM_H_
#define SHAREDCACHESTREAM_H_

#include <string>

struct pollfd;

namespace SharedCache {

class Client;
class CacheFileDesc;

class Stream {
	Client * producer;
	CacheFileDesc * latest;
	std::string id;
	long serial;
public:
	Stream(const std::string & id, Client * producer);
	~Stream();

	CacheFileDesc * newCacheEntry();

	void setLatest(CacheFileDesc * newItem);

	long getLatestSerial() const {
		return serial;
	}

	const std::string & getId() const {
		return id;
	}
};

}

#endif
