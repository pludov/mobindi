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
#include <dirent.h>
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


std::string SharedCacheServer::newFilename() {
	std::string result;
	int fd;
	do {
		std::ostringstream oss;
		oss << "data" << std::setfill('0') << std::setw(12) << (fileGenerator++);
		result = oss.str();
		std::string path = basePath + result;
		fd = open(path.c_str(), O_CREAT | O_EXCL, 0600);
		if (fd == -1 && errno != EEXIST) {
			perror(path.c_str());
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
		signal (SIGHUP, SIG_IGN);
		/*
		chdir("/");
		setsid();
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

void SharedCacheServer::doAccept()
{
	// Accept a new client
	int fd;
	if ((fd = accept(serverFd, 0, 0)) == -1) {
		handleErrno("accept");
		return;
	}

	clients.insert(new Client(this, fd));
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
	std::cerr << "Server received request from " << c->fd << " : " << debug.dump(0) << "\n";
}

// Either proceed directly the message, or put the client in a waiting queue
void SharedCacheServer::proceedNewMessage(Client * c)
{
	if (c->activeRequest->contentRequest) {
		waitingConsumers.add(c);
		return;
	}
	if (c->activeRequest->workRequest) {
		waitingWorkers.add(c);
		return;
	}

	if (c->activeRequest->finishedAnnounce) {
		std::string filename = c->activeRequest->finishedAnnounce->filename;
		auto cfdLoc = contentByFilename.find(filename);
		if (cfdLoc == contentByFilename.end()) {
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
		std::string filename = c->activeRequest->releasedAnnounce->filename;
		auto cfdLoc = contentByFilename.find(filename);
		if (cfdLoc == contentByFilename.end()) {
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

	std::set<std::string> dedup;
	std::list<std::pair<Messages::ContentRequest, std::string>> requirements;

public:
	RequirementEvaluator(SharedCacheServer * server) : server(server) {}

	void markAsRequired(const Messages::ContentRequest & r, const std::string & key) {
		if (!dedup.insert(key).second) {
			return;
		}
		requirements.push_back(std::pair<Messages::ContentRequest, std::string>(r, key));
	}

	std::pair<CacheFileDesc *, Messages::ContentRequest> startFirst() {
		while (!requirements.empty()) {
			std::pair<Messages::ContentRequest, std::string> r = requirements.front();
			requirements.pop_front();
			auto exists = server->contentByIdentifier.find(r.second);
			if (exists != server->contentByIdentifier.end()) {
				// Already producing. Ingore.
				continue;
			}
			return
					std::pair<CacheFileDesc *, Messages::ContentRequest>(
						new CacheFileDesc(server, r.second, server->newFilename()),
						r.first);
		}
		return std::pair<CacheFileDesc *, Messages::ContentRequest>(nullptr, Messages::ContentRequest());
	}
};

void SharedCacheServer::workerLogic(Cache * cache)
{
	while(true) {
		Messages::Request queryWork;
		queryWork.workRequest.build();

		Messages::Result work = cache->clientSend(queryWork);

		// Create an entry object out of work
		Entry * entry = new Entry(cache, *work.todoResult);

		// FIXME: report errors
		work.todoResult->content->produce(entry);

		entry->produced();
		delete(entry);
	}
}

void Messages::ContentRequest::produce(Entry * entry)
{
	this->fitsContent->produce(entry);
}

void SharedCacheServer::startWorker()
{
	// FIXME: close all sockets...
	int fd[2];
	if (socketpair(PF_LOCAL, SOCK_STREAM, 0, fd) == -1) {
		perror("socketpair");
		throw std::runtime_error("failed to create socket pair");
	}
	int on = 1;
	if (ioctl(fd[0], FIONBIO, (char *)&on) == -1)
	{
		perror("ioctl");
		close(fd[0]);
		close(fd[1]);
		throw std::runtime_error("Unable to setup socket");
	}

	pid_t pid = fork();
	if (pid == -1) {
		perror("fork");
		throw std::runtime_error("failed to create socket pair");
	}
	if (pid == 0) {

		close(fd[0]); /* Close the parent file descriptor */
		// FIXME: close all but fd[1]...
		// FIXME: free all server
		try {
			workerLogic(new Cache(basePath, maxSize, fd[1]));
		}catch(...) {
			_exit(255);
		}
		std::cerr << "Worker dead\n";
		_exit(0);
	}
	close(fd[1]);

	Client * worker = new Client(this, fd[0]);
	worker->worker = true;
	clients.insert(worker);
	std::cerr << "New worker started\n";
	startedWorkerCount ++;
}

void SharedCacheServer::clearWorkingDirectory()
{
	DIR* dir = opendir(basePath.c_str());
	if (dir == nullptr) {
		perror("opendir");
		return;
	}
	dirent * entry;
	while((entry = readdir(dir))) {
		std::string name(entry->d_name);
		if (name == "." || name == "..") {
			continue;
		}
		name = basePath + "/" + name;
		if (unlink(name.c_str()) == -1) {
			perror(name.c_str());
		}
	}

	closedir(dir);
}

void SharedCacheServer::server()
{
	clearWorkingDirectory();

	// Cleanup the directory
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

		for(auto it = clients.begin(); it != clients.end();)
		{
			Client * c = *it;
			it++;

			c->poll = polls + (pollCount++);
			c->poll->fd = c->fd;
			if (c->writeBufferLeft) {
				c->poll->events=POLLOUT|POLLIN;
			} else {
				c->poll->events=POLLIN;
			}
		}

		if (poll(polls, pollCount, 1000) == -1) {
			perror("poll");
			throw std::runtime_error("Unable to poll");
		}

		if (server->revents & POLLIN) {
			doAccept();
		}

		for(auto it = clients.begin(); it != clients.end();) {
			Client * c = *it++;
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
				} else if (rd == 0 || c->activeRequest) {
					if (rd != 0) {
						std::cerr << "Client " << c->fd << " sent too much data\n";
					} else {
						std::cerr << "Client " << c->fd << " terminated\n";
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
			Client * c = (*it++);

			std::pair<CacheFileDesc *, Messages::ContentRequest> entry = evaluator.startFirst();
			if (entry.first == nullptr) {
				break;
			}

			Messages::Result resultMessage;
			resultMessage.todoResult.build();
			resultMessage.todoResult->content = new Messages::ContentRequest(entry.second);
			resultMessage.todoResult->filename = entry.first->filename;
			waitingWorkers.remove(c);
			c->producing.push_back(entry.first);
			c->reply(resultMessage);
		}
	}
}
} /* namespace SharedCache */
