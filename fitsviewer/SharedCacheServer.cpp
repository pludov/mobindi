/*
 * SharedCacheServer.cpp
 *
 *  Created on: 30 déc. 2017
 *      Author: ludovic
 */
#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <poll.h>
#include <sys/ioctl.h>
#include <stdint.h>
#include <signal.h>
#include <assert.h>
#include <iostream>
#include "SharedCacheServer.h"

namespace SharedCache {

static long now() {
	return 0;
}


class CacheFileDesc {
	friend class SharedCacheServer;
	long size;
	long prodDuration;
	long lastUse;

	bool produced;
	long clientCount;
	std::string identifier;
	std::string path;

	CacheFileDesc(const std::string & identifier, const std::string & path):
		identifier(identifier),
		path(path)
	{
		size = 0;
		prodDuration = 0;
		lastUse = now();
		produced = false;
		clientCount = 0;
	}

	void unlink()
	{
		if (::unlink(path.c_str()) == -1) {
			perror(path.c_str());
		}
	}
};

class Client {
	friend class SharedCacheServer;

	int fd;

	char * readBuffer;
	int readBufferPos;

	Messages::Request * blockingRequest;
	std::list<CacheFileDesc *> reading;
	std::list<CacheFileDesc *> producing;

	char * writeBuffer;
	int writeBufferPos;
	int writeBufferLeft;

	pollfd * poll;

	Client(int fd) :readBuffer(), writeBuffer() {
		this->fd = fd;
		poll = nullptr;
		blockingRequest = nullptr;
		writeBufferPos = 0;
		writeBufferLeft = 0;
		readBufferPos = 0;
		readBuffer = (char*)malloc(MAX_MESSAGE_SIZE);
		writeBuffer = (char*)malloc(MAX_MESSAGE_SIZE);
	}
	~Client()
	{
		if (this->fd != -1) {
			close(this->fd);
			this->fd = -1;
		}
		delete(blockingRequest);
		free(readBuffer);
		free(writeBuffer);
	}

	void kill()
	{
		close(this->fd);
		this->fd = -1;
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
	}
};

SharedCacheServer::SharedCacheServer(const std::string & path, long maxSize):
			basePath(path),
			maxSize(maxSize)
{
	serverFd = -1;
	fileGenerator = 0;
}

SharedCacheServer::~SharedCacheServer() {
	// TODO Auto-generated destructor stub
}


std::string SharedCacheServer::newPath() {
	std::string result;
	int fd;
	do {
		std::ostringstream oss;
		oss << basePath << "/data" << std::setfill('0') << std::setw(12) << (fileGenerator++);
		result = oss.str();
		fd = open(result.c_str(), O_CREAT | O_EXCL, 0600);
		if (fd == -1 && errno != EEXIST) {
			perror(result.c_str());
			throw std::runtime_error("Failed to create data file");
		}
	} while(fd == -1);
	close(fd);
	return result;
}

void SharedCacheServer::init() {
	serverFd = socket(AF_UNIX, SOCK_STREAM, 0);
	if (serverFd < 0) {
		perror("socket");
		throw std::runtime_error("Unable to create socket");
	}
	int on = 1;
	if (ioctl(serverFd, FIONBIO, (char *)&on) == -1)
	{
		perror("ioctl");
		throw std::runtime_error("Unable to setup socket");
	}
	struct sockaddr_un addr;
	Cache::setSockAddr(basePath, addr);
	int rslt = bind(serverFd, (struct sockaddr*)&addr, sizeof(addr));
	if (rslt == -1) {
		if (errno == EADDRINUSE) {
			// Suggest that another server just started.
			return;
		}
		perror(basePath.c_str());
		throw std::runtime_error("Unable to bind socket");
	}
	if (listen(serverFd, 32) == -1) {
		perror("listen");
		close(serverFd);
		throw std::runtime_error("Unable to listen");
	}
	signal(SIGCHLD, SIG_IGN); //stops the parent waiting for the child process to end
	pid_t p = fork();
	if (p == -1) {
		perror("fork");
		close(serverFd);
		throw std::runtime_error("Unable to fork");
	}
	if (p == 0) {
		std::cerr << "Server started\n";
		chdir("/");
		signal (SIGHUP, SIG_IGN);
		/*setsid();
		close(0);
		close(1);
		close(2);*/

		try {
			server();
		} catch(...) {
			//_exit(0);
			throw;
		}
		//_exit(0);
	}
	close(serverFd);
}

static void handleErrno(const char * msg)
{
	if (errno == EAGAIN || errno == EINTR) {
		return;
	}
	perror(msg);
	throw std::runtime_error(std::string(msg));
}

Client * SharedCacheServer::doAccept()
{
	// Accept a new client
	int fd;
	if ((fd = accept(serverFd, 0, 0)) == -1) {
		handleErrno("accept");
		return nullptr;
	}

	return new Client(fd);
}

void SharedCacheServer::receiveMessage(Client * c, uint16_t size)
{
//		printf("Message from %d (%d):\n", c->fd, c->readBufferPos);
	std::string jsonStr(c->readBuffer + 2, c->readBufferPos - 2);
//		printf("%s\n", jsonStr.c_str());
	c->readBufferPos = 0;
	auto json = nlohmann::json::parse(jsonStr);
	c->blockingRequest = new Messages::Request(json.get<Messages::Request>());

	nlohmann::json debug = *c->blockingRequest;
	std::cerr << "Received request: " << debug.dump(0) << "\n";

	blockedClients.push_back(c);
}

bool SharedCacheServer::proceedMessage(Client * c)
{
	if (c->blockingRequest->contentRequest) {
		nlohmann::json j = *c->blockingRequest->contentRequest;
		std::string identifier = j.dump();
		auto where = contentByIdentifier.find(identifier);
		if (where == contentByIdentifier.end()) {
			CacheFileDesc * cfd = new CacheFileDesc(identifier, newPath());
			cfd->produced = false;
			cfd->lastUse = now();
			cfd->prodDuration = 0;
			cfd->size = 0;
			cfd->clientCount = 1;
			contentByIdentifier[identifier] = cfd;
			contentByPath[cfd->path] = cfd;

			c->producing.push_back(cfd);

			Messages::Result result;
			result.contentResult = new Messages::ContentResult();
			result.contentResult->path = cfd->path;
			result.contentResult->ready = false;
			c->reply(result);
			return true;
		} else {
			CacheFileDesc * cfd = where->second;
			if (!cfd->produced) {
				// Not ready... Please wait
				return false;
			}

			cfd->clientCount++;

			// Ready...
			Messages::Result result;
			result.contentResult = new Messages::ContentResult();
			result.contentResult->path = cfd->path;
			result.contentResult->ready = true;
			c->reading.push_back(cfd);
			c->reply(result);
			return true;
		}
	}

	if (c->blockingRequest->finishedAnnounce) {
		std::string path = c->blockingRequest->finishedAnnounce->path;
		auto cfdLoc = contentByPath.find(path);
		if (cfdLoc == contentByPath.end()) {
			std::cerr << "Access to unknown file rejected\n";
			c->kill();
			return true;
		}
		CacheFileDesc * cfd = cfdLoc->second;
		if (cfd->produced) {
			std::cerr << "Announce to already producing rejected\n";
			c->kill();
			return true;
		}
		auto cfdLocInProducing = std::find(c->producing.begin(), c->producing.end(), cfd);
		if (cfdLocInProducing == c->producing.end()) {
			std::cerr << "Announce for not producing rejected\n";
			c->kill();
			return true;
		}

		c->producing.erase(cfdLocInProducing);
		c->reading.push_back(cfd);
		cfd->clientCount++;
		cfd->produced = true;
		Messages::Result result;
		c->reply(result);
		return true;
	}
	if (c->blockingRequest->releasedAnnounce) {
		std::string path = c->blockingRequest->releasedAnnounce->path;
		auto cfdLoc = contentByPath.find(path);
		if (cfdLoc == contentByPath.end()) {
			std::cerr << "Access to unknown file rejected\n";
			c->kill();
			return true;
		}
		CacheFileDesc * cfd = cfdLoc->second;
		if (!cfd->produced) {
			std::cerr << "Release of not produced rejected\n";
			c->kill();
			return true;
		}
		auto cfdLocInProducing = std::find(c->reading.begin(), c->reading.end(), cfd);
		if (cfdLocInProducing == c->reading.end()) {
			std::cerr << "Release for not read rejected\n";
			c->kill();
			return true;
		}

		c->reading.erase(cfdLocInProducing);
		cfd->clientCount--;
		Messages::Result result;
		c->reply(result);
		return true;
	}
	std::cerr << "Client has invalid blocking request ?\n";
	c->kill();
	return true;
}

void SharedCacheServer::server()
{
	std::vector<Client *> clients;
	while(true) {
		pollfd polls[clients.size() + 1];

		pollfd * server;
		int pollCount = 0;

		server = polls + (pollCount++);
		server->fd = serverFd;
		server->events = POLLIN;

		for(int i = 0; i < clients.size(); ++i)
		{
			clients[i]->poll = polls + (pollCount++);
			clients[i]->poll->fd = clients[i]->fd;
			if (clients[i]->writeBufferLeft) {
				clients[i]->poll->events=POLLOUT;
			} else {
				clients[i]->poll->events=POLLIN;
			}

		}

		if (poll(polls, pollCount, 1000) == -1) {
			perror("poll");
			throw std::runtime_error("Unable to poll");
		}

		if (server->revents & POLLIN) {
			Client * c = doAccept();
			if (c != nullptr) {
				clients.push_back(c);
			}
		}

		for(int i = 0; i < clients.size(); ++i) {
			Client * c = clients[i];
			if (!c->poll) {
				continue;
			}
			if (c->writeBufferLeft && (c->poll->revents & POLLOUT)) {
				int wr = write(c->fd, c->writeBuffer + c->writeBufferPos, c->writeBufferLeft);
				if (wr == -1) {
					if (errno == EAGAIN || errno == EINTR) {
						// Just ignore
						continue;
					} else {
						c->kill();
					}
				} else {
					c->writeBufferLeft -= wr;
					if (c->writeBufferLeft == 0) {
						c->readBufferPos = 0;
					}
				}
			} else if ((!c->writeBufferLeft) && (c->poll->revents & POLLIN)) {
				int rd = read(c->fd, c->readBuffer + c->readBufferPos, MAX_MESSAGE_SIZE - c->readBufferPos);
				if (rd == -1) {
					if (errno == EAGAIN || errno == EINTR) {
						// Just ignore
						continue;
					} else {
						c->kill();
					}
				} else if (rd == 0 || clients[i]->blockingRequest) {
					if (rd != 0) {
						std::cerr << "Client " << clients[i]->fd << " sent too much data\n";
					}
					c->kill();
				} else {
					// FIXME: read 0 ? possible ?
					c->readBufferPos += rd;
					if (c->readBufferPos > 2) {
						uint16_t size = *(uint16_t*)c->readBuffer;
						if (size >= MAX_MESSAGE_SIZE || size <= 2) {
							c->kill();
						} else if (size >= c->readBufferPos){
							// Process a message for the client.
							try {
								receiveMessage(c, size);
							} catch(const std::exception& ex) {
								std::cerr << "Error on client " << c->fd << ": "<< ex.what() << "\n";
								c->kill();
							}
						} else if (c->readBufferPos == MAX_MESSAGE_SIZE) {
							c->kill();
						}
					}
				}
			}
		}

		bool restart;
		do {
			restart = false;
			// Proceed all blocked clients.
			// When a client is unblocked, it may be possible to restart already blocked clients
			for(auto it = blockedClients.begin(); it != blockedClients.end();)
			{
				Client * c = *it;
				if (c->fd == -1) {
					continue;
				}
				if (proceedMessage(c)) {
					delete c->blockingRequest;
					c->blockingRequest = nullptr;
					it = blockedClients.erase(it);
					restart = true;
				} else {
					 ++it;
				}
			}

			for(int i = 0; i < clients.size();) {
				Client  * c = clients[i];
				if (c->fd == -1) {
					for(auto it = c->producing.begin(); it != c->producing.end(); ++it)
					{
						// Remove the producing.
						// Remove the file as well
						CacheFileDesc * cfd = *it;
						std::cerr << "Production of " << cfd->identifier << " in " << cfd->path << " failed\n";
						contentByIdentifier.erase(cfd->identifier);
						contentByPath.erase(cfd->identifier);
						cfd->unlink();
						delete(cfd);
					}
					for(auto it = c->reading.begin(); it != c->reading.end(); ++it)
					{
						CacheFileDesc * cfd = *it;
						cfd->clientCount --;
					}
					if (c->blockingRequest) {
						auto where = std::find(blockedClients.begin(), blockedClients.end(), c);
						if (where != blockedClients.end()) {
							blockedClients.erase(where);
						}
					}
					delete(c);
					clients[i] = clients[clients.size() - 1];
					clients.pop_back();
					restart = true;
				} else {
					i++;
				}
			}
		} while(restart);
	}
}
} /* namespace SharedCache */
