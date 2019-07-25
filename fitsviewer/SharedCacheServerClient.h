#ifndef SHAREDCACHESERVERCLIENT_H_
#define SHAREDCACHESERVERCLIENT_H_

#include <chrono>
#include "SharedCacheServer.h"

struct pollfd;

namespace SharedCache {


long now();

// Instances are either ready or beein worked on
class CacheFileDesc {
	friend class SharedCacheServer;
	friend class Client;
	friend class Stream;

	SharedCacheServer * server;
	long size;
	long prodDuration;
	long lastUse;

	bool produced;
	long clientCount;
	long serial;
	bool error;
	std::string errorDetails;

	std::string identifier;
	// Internal uuid.
	std::string uuid;
	// Shared data buffer
	int memfd;

	CacheFileDesc(SharedCacheServer * server, const std::string & identifier, const std::string & uuid):
		identifier(identifier),
		uuid(uuid)
	{
		this->server = server;
		this->memfd = -1;
		size = 0;
		prodDuration = 0;
		lastUse = now();
		produced = false;
		clientCount = 0;
		error = false;
		serial = 0;
		server->contentByIdentifier[identifier] = this;
		server->contentByUuid[uuid] = this;
	}

	~CacheFileDesc();

	void addReader() {
		clientCount++;
		lastUse = now();
	}

	void removeReader() {
		clientCount--;
	}


	void prodFailed(const std::string & message) {
		// FIXME: mark as error
		// Remove the producing.
		// Remove the file as well
		std::cerr << "Production of " << identifier << " failed\n";
		error = true;
		errorDetails = message;
	}

	void prodAborted() {
		delete(this);
	}

	Messages::ContentResult toContentResult(const Messages::ContentRequest* actualRequest) const {
		Messages::ContentResult r;
		r.memfd = memfd;
		r.uuid = uuid;
		r.error = this->error;
		r.errorDetails = errorDetails;
		r.actualRequest = new Messages::ContentRequest(*actualRequest);
		return r;
	}

	static bool compare_last_use (const CacheFileDesc * first, const CacheFileDesc * second)
	{
		return first->lastUse < second->lastUse;
	}
};


class Client {
	friend class SharedCacheServer;
	friend class ClientFifo;

	SharedCacheServer * server;

	// Is it waiting for a todo item
	bool waitingWorker;

	// Is it waiting for a resource
	bool waitingConsumer;

	// Is it looking for new frame in a stream
	bool streamWatcher;

	int fd;
	pid_t workerPid;

	Messages::Request * activeRequest;
	std::list<CacheFileDesc *> reading;
	std::list<CacheFileDesc *> producing;

	std::chrono::time_point<std::chrono::steady_clock> * watcherExpiry;

	Messages::Writable * pendingWrite;

	bool worker;

	pollfd * poll;

	// Set when a signal has been sent to client. The client will be closed at its next "finished" message
	bool killed;

	Stream* producedStream;

	std::string identifier() const {
		if (workerPid != -1) {
			return "#" + std::to_string(workerPid);
		} else {
			return std::to_string(fd);
		}
	}

	Client(SharedCacheServer * server, int fd, pid_t workerPid) {
		this->fd = fd;
		this->server = server;
		this->workerPid = workerPid;
		poll = nullptr;
		activeRequest = nullptr;
		pendingWrite = nullptr;
		waitingConsumer = false;
		waitingWorker = false;
		worker = false;
		killed = false;
		producedStream = nullptr;
		streamWatcher = false;
		watcherExpiry = nullptr;
	}

	void release() {
		for(auto it = producing.begin(); it != producing.end(); ++it)
		{
			if (!killed) {
				(*it)->prodFailed("generic worker error");
			} else {
				(*it)->prodAborted();
			}
		}
		this->destroy();
	}

	void destroy() {
		delete(this);
	}

	void kill();

private:
	~Client();
public:
	bool reply(const Messages::Result & result) {
		assert(this->pendingWrite == nullptr);

		this->pendingWrite = new Messages::Result(result);

		delete activeRequest;
		activeRequest = nullptr;
		return true;
	}

	// Is it waiting for a todo item
	bool isWaitingWorker() const { return waitingWorker; }
	void setWaitingWorker(bool b) { waitingWorker = b; }

	// Is it waiting for a resource
	bool isWaitingConsumer() const { return waitingConsumer; }
	void setWaitingConsumer(bool b) { waitingConsumer = b; }

	bool isStreamWatcher() const { return streamWatcher; }
	void setStreamWatcher(bool b) { streamWatcher = b; }

	SharedCacheServer * getServer() {
		return server;
	}
};
}


#endif
