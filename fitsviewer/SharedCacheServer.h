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
#include <chrono>
#include "json.hpp"
#include "SharedCache.h"

namespace SharedCache {


class Client;
class Stream;
class CacheFileDesc;

class ClientError : public std::runtime_error {
public:
	ClientError(const std::string & s);
};

class WorkerError : public std::runtime_error {
public:
	WorkerError(const std::string & s);

	static WorkerError fromErrno(int errnoValue, const std::string & msg);
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
	friend class Stream;
	friend class CacheFileDesc;

	std::map<std::string, CacheFileDesc*> contentByIdentifier;
	std::map<std::string, CacheFileDesc*> contentByFilename;


	std::map<std::string, Stream*> streams;

	std::set<Client *> clients;
	// Clients that are stuck in waitOrder state
	ClientFifo waitingWorkers;

	// Clients that awaits some resources
	ClientFifo waitingConsumers;

	// Clients that waits for stream frames
	ClientFifo streamWatchers;

	// Number of workers awaiting for resources (allow temporary increase of the number of workers)
	long waitingContentWorkerCount;

	// Starts and terminate with '/'
	std::string basePath;
	long maxSize;
	long currentSize;

	int serverFd;
	long fileGenerator;
	long streamGenerator;

	int startedWorkerCount;

	[[ noreturn ]] void server();
	void evict(CacheFileDesc * item);
	void clearWorkingDirectory();
	void receiveMessage(Client * client, uint16_t size);
	// True if the client is no more blocked
	void proceedNewMessage(Client * blocked);

	bool checkWaitingConsumer(Client * blocked);

	void doAccept();
	std::string newFilename();

	void startWorker();

	static void workerLogic(Cache * cache);

	// Return -1 if expired
	long isExpiredContent(const Messages::RawContent * content) const;
	void upgradeContentRequest(Client * consumerClient);
	void checkAllStreamWatchersForFrame();
	void checkStreamWatcherForFrame(Client * client);
	void checkAllStreamWatchersForTimeout();
	void checkStreamWatcherForTimeout(Client * client, const std::chrono::time_point<std::chrono::steady_clock> & now);
	void replyStreamWatcher(Client * watcher, bool expired, bool dead);

	Stream * createStream(Client * c);
	void killStream(Stream * s);
	int nextTimeout() const;
public:
	SharedCacheServer(const std::string & path, long maxSize);
	virtual ~SharedCacheServer();

	const std::string & getBasePath() const { return basePath; };

	void init();


};

} /* namespace SharedCache */

#endif /* SHAREDCACHESERVER_H_ */
