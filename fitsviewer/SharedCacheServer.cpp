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
#include "SharedCacheServerClient.h"

namespace SharedCache {

long now()
{
	return 0;
}


ClientError::ClientError(const std::string & msg) : std::runtime_error(msg) {}

ClientFifo::ClientFifo(Getter getter, Setter setter) : setter(setter), getter(getter) {}

void ClientFifo::add(Client * c) {
	if ((c->*getter)()) {
		return;
	}
	(c->*setter)(true);
	push_back(c);
}

void ClientFifo::remove(Client * c) {
	if (!(c->*getter)()) {
		return;
	}
	auto where = std::find(begin(), end(), c);
	if (where != end()) {
		erase(where);
	}
	(c->*setter)(false);
}

SharedCacheServer::SharedCacheServer(const std::string & path, long maxSize):
			basePath(path),
			maxSize(maxSize),
			waitingWorkers(&Client::isWaitingWorker, &Client::setWaitingWorker),
			waitingConsumers(&Client::isWaitingConsumer, &Client::setWaitingConsumer)
{
	serverFd = -1;
	fileGenerator = 0;
	startedWorkerCount = 0;
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

	return new Client(this, fd);
}

void SharedCacheServer::receiveMessage(Client * c, uint16_t size)
{
//		printf("Message from %d (%d):\n", c->fd, c->readBufferPos);
	std::string jsonStr(c->readBuffer + 2, c->readBufferPos - 2);
//		printf("%s\n", jsonStr.c_str());
	c->readBufferPos = 0;
	auto json = nlohmann::json::parse(jsonStr);
	c->activeRequest = new Messages::Request(json.get<Messages::Request>());

	nlohmann::json debug = *c->activeRequest;
	std::cerr << "Received request: " << debug.dump(0) << "\n";
}

bool SharedCacheServer::checkWaitingConsumer(Client * c)
{
	nlohmann::json j = *c->activeRequest->contentRequest;
	std::string identifier = j.dump();
	auto where = contentByIdentifier.find(identifier);
	if (where == contentByIdentifier.end()) {
		CacheFileDesc * cfd = new CacheFileDesc(this, identifier, newPath());
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

// Either proceed directly the message, or put the client in a waiting queue
void SharedCacheServer::proceedNewMessage(Client * c)
{
	if (c->activeRequest->contentRequest) {
		waitingConsumers.push_back(c);
		return;
	}

	if (c->activeRequest->finishedAnnounce) {
		std::string path = c->activeRequest->finishedAnnounce->path;
		auto cfdLoc = contentByPath.find(path);
		if (cfdLoc == contentByPath.end()) {
			throw ClientError("Access to unknown file rejected");
		}
		CacheFileDesc * cfd = cfdLoc->second;
		if (cfd->produced) {
			throw ClientError("Announce to already producing rejected");
		}
		auto cfdLocInProducing = std::find(c->producing.begin(), c->producing.end(), cfd);
		if (cfdLocInProducing == c->producing.end()) {
			throw ClientError("Announce for not producing rejected");
		}

		c->producing.erase(cfdLocInProducing);
		cfd->produced = true;
		Messages::Result result;
		c->reply(result);
		return;
	}
	if (c->activeRequest->releasedAnnounce) {
		std::string path = c->activeRequest->releasedAnnounce->path;
		auto cfdLoc = contentByPath.find(path);
		if (cfdLoc == contentByPath.end()) {
			throw ClientError("Access to unknown file rejected");
		}
		CacheFileDesc * cfd = cfdLoc->second;
		if (!cfd->produced) {
			throw ClientError("Release of not produced rejected");
		}
		auto cfdLocInProducing = std::find(c->reading.begin(), c->reading.end(), cfd);
		if (cfdLocInProducing == c->reading.end()) {
			throw ClientError("Release for not read rejected");
		}

		c->reading.erase(cfdLocInProducing);
		cfd->clientCount--;
		Messages::Result result;
		c->reply(result);
		return;
	}
	throw ClientError("Client has invalid active request ?");
}



class SharedCacheServer::RequirementEvaluator {
	SharedCacheServer * server;

	std::list<Messages::ContentRequest> requirements;

public:
	RequirementEvaluator(SharedCacheServer * server) : server(server) {}

	void markAsRequired(const Messages::ContentRequest & r, const std::string & key) {
		requirements.push_back(r);
	}

	CacheFileDesc * startFirst() {
		if (requirements.empty()) return nullptr;
		Messages::ContentRequest r = requirements.front();
		requirements.pop_front();
		return new CacheFileDesc(server, r.uniqKey(), server->newPath());
	}
};

void SharedCacheServer::startWorker()
{
	// FIXME: close all sockets...
	startedWorkerCount ++;
	throw std::runtime_error("not implemented");
}

void SharedCacheServer::server()
{
	std::vector<Client *> clients;
	while(true) {
		// Starts some workers if possible
		while(startedWorkerCount < 2) {
			startWorker();
		}

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
				} else if (rd == 0 || clients[i]->activeRequest) {
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
							try {
								proceedNewMessage(c);
							} catch(const ClientError & ex) {
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

		std::map<std::string, int> requirements;
		RequirementEvaluator evaluator(this);

		// Distribute availables resources to waiting consumers
		// Compute required resources, and their dependencies
		// Distribute the first required resource to a worker

		for(auto it = waitingConsumers.begin(); it != waitingConsumers.end();)
		{
			Client * c = (*it++);

			std::string identifier = c->activeRequest->contentRequest->uniqKey();

			auto result = contentByIdentifier.find(identifier);
			if (result == contentByIdentifier.end() || !result->second->produced) {
				evaluator.markAsRequired(*(c->activeRequest->contentRequest), identifier);
			} else {
				CacheFileDesc * entry = result->second;
				Messages::Result resultMessage;
				resultMessage.contentResult.build();
				*resultMessage.contentResult = entry->toContentResult();

				waitingConsumers.remove(c);
				entry->addReader();
				c->reading.push_back(entry);
				c->reply(resultMessage);
			}
		}

		// Mark dependencies of all targets as required (with a level)

		// Distribute some works
		// FIXME: check space is ok
		for(auto it = waitingWorkers.begin(); it != waitingWorkers.end();)
		{
			CacheFileDesc * entry = evaluator.startFirst();
			if (entry == nullptr) {
				break;
			}

			Client * c = (*it++);
			Messages::Result resultMessage;
			resultMessage.todoResult.build();
			*resultMessage.todoResult = entry->toContentResult();
			waitingWorkers.remove(c);
			c->producing.push_back(entry);
			c->reply(resultMessage);
		}

		// Remove dead clients
		for(int i = 0; i < clients.size();) {
			Client  * c = clients[i];
			if (c->fd == -1) {

				delete(c);
				clients[i] = clients[clients.size() - 1];
				clients.pop_back();
			} else {
				i++;
			}
		}

	}
}
} /* namespace SharedCache */
