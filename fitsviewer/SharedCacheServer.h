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
#include <set>
#include "json.hpp"
#include "SharedCache.h"

namespace SharedCache {


class Client;
class CacheFileDesc;

class ClientError : public std::runtime_error {
public:
	ClientError(const std::string & s);
};


class ClientFifo : public std::list<Client*> {
	typedef bool (Client::*Getter)() const;
	typedef void (Client::*Setter)(bool value);
private:
	Getter getter;
	Setter setter;
public:
	ClientFifo(Getter getter, Setter setter);

	void add(Client * c);
	void remove(Client * c);
};

class SharedCacheServer {
	class RequirementEvaluator;
	friend class Client;
	friend class CacheFileDesc;

	std::map<std::string, CacheFileDesc*> contentByIdentifier;
	std::map<std::string, CacheFileDesc*> contentByPath;
	std::set<Client *> clients;
	// Clients that are stuck in waitOrder state
	ClientFifo waitingWorkers;

	// Clients that awaits some resources
	ClientFifo waitingConsumers;

	std::string basePath;
	long maxSize;

	int serverFd;
	long fileGenerator;

	int startedWorkerCount;

	void server();
	void receiveMessage(Client * client, uint16_t size);
	// True if the client is no more blocked
	void proceedNewMessage(Client * blocked);

	bool checkWaitingConsumer(Client * blocked);

	void doAccept();
	std::string newPath();

	void startWorker();

	static void workerLogic(Cache * cache);
public:
	SharedCacheServer(const std::string & path, long maxSize);
	virtual ~SharedCacheServer();

	void init();


};

} /* namespace SharedCache */

#endif /* SHAREDCACHESERVER_H_ */
