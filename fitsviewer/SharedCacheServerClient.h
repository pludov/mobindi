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

	bool error;
	std::string errorDetails;

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
		error = false;

		server->contentByIdentifier[identifier] = this;
		server->contentByFilename[filename] = this;
	}

	~CacheFileDesc()
	{
		server->contentByIdentifier.erase(identifier);
		if (filename.size()) {
			server->contentByFilename.erase(filename);
		}
	}

	void unlink()
	{
		std::string path = server->basePath + filename;
		if (::unlink(path.c_str()) == -1) {
			perror(path.c_str());
		}
		server->contentByFilename.erase(filename);
		filename = "";
	}

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
		std::cerr << "Production of " << identifier << " in " << filename << " failed\n";
		unlink();
		error = true;
		errorDetails = message;
	}

	void prodAborted() {
		unlink();
		delete(this);
	}

	Messages::ContentResult toContentResult(const Messages::ContentRequest* actualRequest) const {
		Messages::ContentResult r;
		r.filename = filename;
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

	int fd;
	pid_t workerPid;

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

	// Set when a signal has been sent to client. The client will be closed at its next "finished" message
	bool killed;

	Client(SharedCacheServer * server, int fd, pid_t workerPid) :readBuffer(), writeBuffer() {
		this->fd = fd;
		this->server = server;
		this->workerPid = workerPid;
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
		killed = false;
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
	~Client()
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

		producing.clear();

		server->waitingWorkers.remove(this);
		server->waitingConsumers.remove(this);

		if (worker) {
			server->startedWorkerCount--;
			worker = false;
		}

		server->clients.erase(this);

		free(readBuffer);
		free(writeBuffer);
	}
public:
	bool send(const std::string & str)
	{
		unsigned long l = str.length();
		if (l > MAX_MESSAGE_SIZE - 2) {
			std::cerr << "Unable to send message : " << str << "\n";
			release();
			return false;
		} else {

			*((uint16_t*)writeBuffer) = l;
			memcpy(writeBuffer + 2, str.c_str(), l);
			writeBufferPos = 0;
			writeBufferLeft = 2 + l;
			return true;
		}
	}

	bool reply(const Messages::Result & result) {
		nlohmann::json j = result;
		std::string reply = j.dump(0);

		if (!send(reply)) {
			return false;
		}
		std::cerr << "Server reply to " << fd << " : " << reply << "\n";

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

};
}


#endif
