#ifndef SHAREDCACHESERVERCLIENT_H_
#define SHAREDCACHESERVERCLIENT_H_

#include "SharedCacheServer.h"

struct pollfd;

namespace SharedCache {


long now();

// Instances are either ready or beein worked on
class CacheFileDesc {
	friend class SharedCacheServer;
	friend class Client;

	SharedCacheServer * server;
	long size;
	long prodDuration;
	long lastUse;

	bool produced;
	long clientCount;
	std::string identifier;
	// Path, without the basePath.
	std::string filename;

	CacheFileDesc(SharedCacheServer * server, const std::string & identifier, const std::string & filename):
		identifier(identifier),
		filename(filename)
	{
		this->server = server;
		size = 0;
		prodDuration = 0;
		lastUse = now();
		produced = false;
		clientCount = 0;

		server->contentByIdentifier[identifier] = this;
		server->contentByFilename[filename] = this;
	}

	~CacheFileDesc()
	{
		server->contentByIdentifier.erase(identifier);
		server->contentByFilename.erase(filename);
	}

	void unlink()
	{
		std::string path = server->basePath + filename;
		if (::unlink(path.c_str()) == -1) {
			perror(path.c_str());
		}
	}

	void addReader() {
		clientCount++;
		lastUse = now();
	}

	void removeReader() {
		clientCount--;
	}


	void prodFailed() {
		// FIXME: mark as error
		// Remove the producing.
		// Remove the file as well
		std::cerr << "Production of " << identifier << " in " << filename << " failed\n";
		unlink();
		delete(this);
	}

	Messages::ContentResult toContentResult() const {
		Messages::ContentResult r;
		r.filename = filename;
		r.ready = produced;
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

	int fd;

	char * readBuffer;
	int readBufferPos;

	Messages::Request * activeRequest;
	std::list<CacheFileDesc *> reading;
	std::list<CacheFileDesc *> producing;

	char * writeBuffer;
	int writeBufferPos;
	int writeBufferLeft;

	bool worker;

	pollfd * poll;

	Client(SharedCacheServer * server, int fd) :readBuffer(), writeBuffer() {
		this->fd = fd;
		this->server = server;
		poll = nullptr;
		activeRequest = nullptr;
		writeBufferPos = 0;
		writeBufferLeft = 0;
		readBufferPos = 0;
		readBuffer = (char*)malloc(MAX_MESSAGE_SIZE);
		writeBuffer = (char*)malloc(MAX_MESSAGE_SIZE);
		waitingConsumer = false;
		waitingWorker = false;
		worker = false;
	}

	~Client()
	{
		kill();

		free(readBuffer);
		free(writeBuffer);
	}

	void kill()
	{
		if (this->fd != -1) {
			close(this->fd);
			this->fd = -1;
		}
		delete(activeRequest);
		activeRequest = nullptr;

		for(auto it = reading.begin(); it != reading.end(); ++it)
		{
			(*it)->removeReader();
		}
		reading.clear();

		for(auto it = producing.begin(); it != producing.end(); ++it)
		{
			(*it)->prodFailed();
		}
		producing.clear();

		server->waitingWorkers.remove(this);
		server->waitingConsumers.remove(this);

		if (worker) {
			server->startedWorkerCount--;
			worker = false;
		}

		server->clients.erase(this);

	}

	void send(const std::string & str)
	{
		if (this->fd == -1) return;
		unsigned long l = str.length();
		if (l > MAX_MESSAGE_SIZE - 2) {
			kill();
		} else {

			*((uint16_t*)writeBuffer) = l;
			memcpy(writeBuffer + 2, str.c_str(), l);
			writeBufferPos = 0;
			writeBufferLeft = 2 + l;
		}
	}

	void reply(const Messages::Result & result) {
		nlohmann::json j = result;
		std::string reply = j.dump(0);
		send(reply);
		std::cerr << "Server reply to " << fd << " : " << reply << "\n";

		delete activeRequest;
		activeRequest = nullptr;
	}

	// Is it waiting for a todo item
	bool isWaitingWorker() const { return waitingWorker; }
	void setWaitingWorker(bool b) { waitingWorker = b; }

	// Is it waiting for a resource
	bool isWaitingConsumer() const { return waitingConsumer; }
	void setWaitingConsumer(bool b) { waitingConsumer = b; }

};
}


#endif
