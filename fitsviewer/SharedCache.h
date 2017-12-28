#ifndef SHAREDCACHE_H
#define SHAREDCACHE_H 1

#include <string>
#include "json.hpp"

// create a file in /tmp (0 size)
// adjust its size
// initialize the structure
// create a semaphore
// mark it ready
namespace SharedCache {

	class Entry {

		std::string & path;
	};

	class Client;
	class CacheFileDesc;
	class Cache {
		std::map<std::string, CacheFileDesc*> content;
		std::string basePath;
		int clientFd;
		int serverFd;
		long maxSize;

		// Wait a message and returns its size
		int clientWaitMessage(char * buffer);
		void clientSendMessage(const void * data, int length);
		void setSockAddr(struct sockaddr_un & addr);
		// Try to connect
		void init();
		void connectExisting();
		void server();
		void processMessage(Client * client, uint16_t size);
		Client * doAccept();
	public:
		Cache(const std::string & path, long maxSize);

		Entry * getEntry(const nlohmann::json & jsonDesc);
	};
}

#endif
