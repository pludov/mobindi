/*
 * SharedCacheServer.h
 *
 *  Created on: 30 déc. 2017
 *      Author: ludovic
 */

#ifndef SHAREDCACHESERVER_H_
#define SHAREDCACHESERVER_H_

#include <string>
#include <list>
#include "json.hpp"
#include "SharedCache.h"

namespace SharedCache {


class Client;
class CacheFileDesc;

class SharedCacheServer {
	std::map<std::string, CacheFileDesc*> contentByIdentifier;
	std::map<std::string, CacheFileDesc*> contentByPath;
	std::list<Client*> blockedClients;
	std::string basePath;
	long maxSize;

	int serverFd;
	long fileGenerator;

	void server();
	void receiveMessage(Client * client, uint16_t size);
	// True if the client is no more blocked
	bool proceedMessage(Client * blocked);
	Client * doAccept();
	std::string newPath();
public:
	SharedCacheServer(const std::string & path, long maxSize);
	virtual ~SharedCacheServer();

	void init();
};

} /* namespace SharedCache */

#endif /* SHAREDCACHESERVER_H_ */
