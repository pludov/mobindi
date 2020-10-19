/*
 * SharedCacheServer.cpp
 *
 *  Created on: 30 déc. 2017
 *      Author: ludovic
 */
#include <sys/types.h>
#include <sys/stat.h>
#include <sys/wait.h>
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
#include <sstream>
#include <iomanip>
#include <dirent.h>

#include <chrono>

#include "SharedCacheServer.h"
#include "SharedCacheServerClient.h"
#include "Stream.h"
#include "uuid.h"

namespace SharedCache {

static long nowCpt = 0;
long now()
{
	return nowCpt++;
}


ClientError::ClientError(const std::string & msg) : std::runtime_error(msg) {}
WorkerError::WorkerError(const std::string & msg) : std::runtime_error(msg) {}

WorkerError WorkerError::fromErrno(int fromErrno, const std::string & msg) {
	char buffer[ 256 ];
    char * errorMessage = strerror_r( errno, buffer, 256 ); // get string message from errno
	return WorkerError(msg + ": " + std::string(errorMessage));
}

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

Client::~Client()
{
	if (this->fd != -1) {
		::close(this->fd);
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

	if (worker && isWaitingConsumer()) {
		server->waitingContentWorkerCount --;
	}
	server->waitingWorkers.remove(this);
	server->waitingConsumers.remove(this);
	server->streamWatchers.remove(this);
	if (worker) {
		server->startedWorkerCount--;
		worker = false;
	}

	server->clients.erase(this);

	free(readBuffer);
	free(writeBuffer);
	if (watcherExpiry != nullptr) {
		delete watcherExpiry;
	}

	if (this->producedStream != nullptr) {
		this->producedStream->producerDead();
	}
}

void Client::kill()
{
	if (killed) {
		return;
	}
	std::cerr << "Killing client " << this->identifier() << "\n";
	killed = true;
	::kill(-workerPid, SIGINT);
}

SharedCacheServer::SharedCacheServer(const std::string & path, long maxSize):
			basePath(path),
			maxSize(maxSize),
			waitingWorkers(&Client::isWaitingWorker, &Client::setWaitingWorker),
			waitingConsumers(&Client::isWaitingConsumer, &Client::setWaitingConsumer),
			streamWatchers(&Client::isStreamWatcher, &Client::setStreamWatcher)
{
	serverFd = -1;
	fileGenerator = 0;
	startedWorkerCount = 0;
	waitingContentWorkerCount = 0;
	currentSize = 0;
}

SharedCacheServer::~SharedCacheServer() {
	for(auto it = clients.begin(); it != clients.end();)
	{
		Client * c = *(it++);
		c->destroy();
	}

	for(auto it = contentByIdentifier.begin(); it != contentByIdentifier.end();)
	{
		CacheFileDesc* item = (it++)->second;
		delete(item);
	}
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

		int nullFdw = open("/dev/null", O_WRONLY);
		if (nullFdw == -1)  {
			perror("/dev/null");
		} else {
			dup2(nullFdw, 1);
			if (!getenv("DEBUG")) {
				dup2(nullFdw, 2);
			}
			close(nullFdw);
		}

		int nullFdr = open("/dev/null", O_RDONLY);
		if (nullFdr == -1)  {
			perror("/dev/null");
		} else {
			dup2(nullFdr, 0);
			close(nullFdr);
		}
		if (chdir("/") == -1) {
			perror("/dev/null");
		}
		setsid();

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

	clients.insert(new Client(this, fd, -1));
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
	std::cerr << "Server received request from " << c->identifier() << " : " << debug.dump(0) << "\n";
}

long SharedCacheServer::isExpiredContent(const Messages::RawContent * content) const
{
	if ((!content->stream.empty()) && (!content->exactSerial)) {
		auto streamIt = this->streams.find(content->stream);
		if (streamIt != this->streams.end()) {
			long res = (streamIt->second)->getLatestSerial();
			// For first image, wait
			if (res == 0) {
				res = 1;
			}
			return res;
		}
	}

	return content->serial;
}

void SharedCacheServer::upgradeContentRequest(Client * consumerClient)
{
	std::list<Messages::RawContent*> rawContents;

	consumerClient->activeRequest->contentRequest->collectRawContents(rawContents);
	for(auto it = rawContents.begin(); it != rawContents.end();) {
		auto rawContent = *it;
		it++;

		if (rawContent->exactSerial) {
			continue;
		}

		long newSerial = this->isExpiredContent(rawContent);
		if (newSerial != rawContent->serial) {
			rawContent->serial = newSerial;

			std::string identifier = consumerClient->activeRequest->contentRequest->uniqKey();
			auto result = contentByIdentifier.find(identifier);
			// Production started. Lock that
			if (result != contentByIdentifier.end()) {
				rawContent->exactSerial = true;
				continue;
			}
		}
	}

	// TODO : quand un client est terminé (servi ou pas) avec un contenu upgradable mais fixe,
	// vérifier que le contenu obsolète n'est plus en cache
}

Stream * SharedCacheServer::createStream(Client * c)
{
	std::string uid;
	do {
		uid = uuid(24);
	} while(this->streams.find(uid) != this->streams.end());

	Stream * stream = new Stream(uid, c);
	this->streams[uid] = stream;
	c->producedStream = stream;
	return stream;
}

void SharedCacheServer::killStream(Stream * stream)
{
	streams.erase(streams.find(stream->getId()));
	delete(stream);
	this->checkAllStreamWatchersForFrame();
}

void SharedCacheServer::replyStreamWatcher(Client * watcher, bool expired, bool dead)
{
	if (watcher->watcherExpiry != nullptr) {
		delete watcher->watcherExpiry;
		watcher->watcherExpiry = nullptr;
	}

	this->streamWatchers.remove(watcher);

	Messages::Result resultMessage;
	resultMessage.streamWatchResult.build();
	resultMessage.streamWatchResult->timedout = expired;
	resultMessage.streamWatchResult->dead = dead;
	watcher->reply(resultMessage);
}

void SharedCacheServer::checkStreamWatcherForFrame(Client * c) {
	auto streamId = c->activeRequest->streamWatchRequest->stream;
	auto serial = c->activeRequest->streamWatchRequest->serial;

	auto streamIt = this->streams.find(streamId);
	if (streamIt == this->streams.end()) {
		this->replyStreamWatcher(c, false, true);
		return;
	}
	auto stream = streamIt->second;
	if (stream->getLatestSerial() > serial) {
		this->replyStreamWatcher(c, false, false);
	}
}

void SharedCacheServer::checkAllStreamWatchersForFrame() {
	// Dispatch the new frame to stream watchers
	for(auto it = streamWatchers.begin(); it != streamWatchers.end();)
	{
		Client * c = (*it++);
		this->checkStreamWatcherForFrame(c);
	}
}

void SharedCacheServer::checkStreamWatcherForTimeout(Client *c , const std::chrono::time_point<std::chrono::steady_clock> & now) {
	if (c->watcherExpiry != nullptr && (*c->watcherExpiry <= now)) {
		this->replyStreamWatcher(c, true, false);
	}
}

void SharedCacheServer::checkAllStreamWatchersForTimeout() {
	// Dispatch the new frame to stream watchers
	auto now = std::chrono::steady_clock::now();
	for(auto it = streamWatchers.begin(); it != streamWatchers.end();)
	{
		Client * c = (*it++);
		this->checkStreamWatcherForTimeout(c, now);
	}
}

// Either proceed directly the message, or put the client in a waiting queue
void SharedCacheServer::proceedNewMessage(Client * c)
{
	if (c->activeRequest->streamStartImageRequest) {
		if (c->producedStream == nullptr) {
			createStream(c);
		}
		if (!c->producing.empty()) {
			throw ClientError("Cannot produce more than one entry");
		}

		CacheFileDesc * newContent = c->producedStream->newCacheEntry();
		// c->producing.push_back();
		Messages::Result resultMessage;
		resultMessage.streamStartImageResult.build();
		resultMessage.streamStartImageResult->filename = newContent->filename;
		resultMessage.streamStartImageResult->streamId = c->producedStream->getId();

		c->producing.push_back(newContent);
		c->reply(resultMessage);
		return;
	}

	if (c->activeRequest->streamPublishRequest) {
		if (c->producedStream == nullptr) {
			throw ClientError("publish request for non streaming client");
		}
		std::string filename = c->activeRequest->streamPublishRequest->filename;
		auto cfdLoc = contentByFilename.find(filename);
		if (cfdLoc == contentByFilename.end()) {
			throw ClientError("Access to unknown file rejected");
		}
		CacheFileDesc * cfd = cfdLoc->second;
		if (cfd->produced || cfd->error) {
			throw ClientError("Announce to already producing rejected");
		}
		auto cfdLocInProducing = std::find(c->producing.begin(), c->producing.end(), cfd);
		if (cfdLocInProducing == c->producing.end()) {
			throw ClientError("Announce for not producing rejected");
		}

		c->producing.erase(cfdLocInProducing);
		cfd->produced = true;
		cfd->size = c->activeRequest->streamPublishRequest->size;
		cfd->lastUse = now();
		currentSize += cfd->size;

		c->producedStream->setLatest(cfd);

		Messages::Result result;
		result.streamPublishResult.build();
		result.streamPublishResult->serial = c->producedStream->getLatestSerial();

		c->reply(result);
		if (c->killed) {
			c->release();
		}

		// Upgrade all clients to latest rev of content
		for(auto it = waitingConsumers.begin(); it != waitingConsumers.end();)
		{
			Client * c = (*it++);
			this->upgradeContentRequest(c);
		}

		this->checkAllStreamWatchersForFrame();
		return;
	}

	if (c->activeRequest->streamWatchRequest) {
		streamWatchers.add(c);
		if (c->activeRequest->streamWatchRequest->timeout != 0) {
			c->watcherExpiry = new std::chrono::time_point<std::chrono::steady_clock>(std::chrono::steady_clock::now() +
										std::chrono::milliseconds(c->activeRequest->streamWatchRequest->timeout));
		}

		this->checkStreamWatcherForFrame(c);
		return;
	}

	if (c->activeRequest->contentRequest) {
		// Ici: upgrader les requetes à l'entrée
		waitingConsumers.add(c);
		if (c->worker) {
			waitingContentWorkerCount++;
		}
		this->upgradeContentRequest(c);
		return;
	}
	if (c->activeRequest->workRequest) {
		if (c->workerPid == -1) {
			throw new std::runtime_error("Client is not a worker");
		}
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
		if (cfd->produced || cfd->error) {
			throw ClientError("Announce to already producing rejected");
		}
		auto cfdLocInProducing = std::find(c->producing.begin(), c->producing.end(), cfd);
		if (cfdLocInProducing == c->producing.end()) {
			throw ClientError("Announce for not producing rejected");
		}

		c->producing.erase(cfdLocInProducing);
		if (c->activeRequest->finishedAnnounce->error) {
			cfd->prodFailed(c->activeRequest->finishedAnnounce->errorDetails);
		} else {
			cfd->produced = true;
			cfd->size = c->activeRequest->finishedAnnounce->size;
			cfd->lastUse = now();
			currentSize += cfd->size;
		}
		Messages::Result result;
		c->reply(result);
		if (c->killed) {
			c->release();
		}
		return;
	}
	if (c->activeRequest->releasedAnnounce) {
		std::string filename = c->activeRequest->releasedAnnounce->filename;
		auto cfdLoc = contentByFilename.find(filename);
		if (cfdLoc == contentByFilename.end()) {
			throw ClientError("Release of unknown file rejected");
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

	bool required(const CacheFileDesc * cfd)
	{
		return (dedup.find(cfd->identifier) != dedup.end());
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
		try {
			work.todoResult->content->produce(entry);

			entry->produced();
		} catch(const WorkerError & e) {
			std::cerr << "Worker produce failed with WorkerError: "<< e.what() << "\n";
			entry->failed(e.what());
		}catch(const std::exception& e) {
			std::cerr << "Worker produce failed: "<< e.what() << "\n";
			entry->failed(std::string("internal error:") + e.what());
			_exit(255);
		}
		delete(entry);
	}
}

void Messages::ContentRequest::produce(Entry * entry)
{
	if (this->fitsContent) {
		this->fitsContent->produce(entry);
		return;
	}
	if (this->histogram) {
		this->histogram->produce(entry);
		return;
	}
	if (this->starField) {
		this->starField->produce(entry);
		std::cerr << "Json produced!\n";

		return;
	}
	if (this->astrometry) {
		this->astrometry->produce(entry);
		std::cerr << "Astrometry done!\n";

		return;
	}
	throw WorkerError("Invalid ContentRequest");

}

bool Messages::ContentRequest::asJsonResult(Entry * e, nlohmann::json & j, const nlohmann::json & options) const {
	if (histogram) {
		return histogram->asJsonResult(e, j, options);
	}
	return false;
}

void Messages::StarField::collectRawContents(std::list<Messages::RawContent*> & into)
{
	into.push_back(&this->source);
}

void Messages::Astrometry::collectRawContents(std::list<Messages::RawContent*> & into)
{
	this->source.collectRawContents(into);
}

void Messages::Histogram::collectRawContents(std::list<Messages::RawContent*> & into)
{
	into.push_back(&this->source);
}

void Messages::ContentRequest::collectRawContents(std::list<Messages::RawContent*> & into)
{
	if (this->fitsContent) {
		into.push_back(&*this->fitsContent);
	}
	if (this->histogram) {
		this->histogram->collectRawContents(into);
	}
	if (this->starField) {
		this->starField->collectRawContents(into);
	}
	if (this->astrometry) {
		this->astrometry->collectRawContents(into);
	}
}

std::string Messages::ContentRequest::uniqKey()
{
	std::list<RawContent *> rawContents;
	collectRawContents(rawContents);
	for(auto it = rawContents.begin(); it != rawContents.end();)
	{
		auto v = *it;
		if (v->exactSerial) {
			v->exactSerial = false;
			it++;
		} else {
			it = rawContents.erase(it);
		}
	}

	nlohmann::json debug = *this;

	for(auto it = rawContents.begin(); it != rawContents.end();)
	{
		auto v = *(it++);
		v->exactSerial = true;
	}

	return debug.dump(0);
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

	// prevent process from vanishing between for/setpgid
	signal(SIGCHLD, SIG_DFL);

	pid_t pid = fork();
	if (pid == -1) {
		perror("fork");
		throw std::runtime_error("failed to create socket pair");
	}
	if (pid == 0) {

		close(fd[0]); /* Close the parent file descriptor */

		/* Go in own process group */
		if (setpgid(0, 0) == -1) {
			perror("child setpgid");
		}
		// FIXME: close all but fd[1]...
		try {
			Cache * clientCache = new Cache(basePath, maxSize, fd[1]);
			// free all server
			delete(this);

			// restore child process handling to default
			signal(SIGCHLD, SIG_DFL);

			workerLogic(clientCache);
		}catch(const std::exception& e) {
			std::cerr << "Worker #" << getpid() << " dead: " << e.what() << "\n";
			_exit(255);
		}catch(...) {
			std::cerr << "Worker #" << getpid() << " with exception\n";
			_exit(255);
		}
		std::cerr << "Worker dead\n";
		_exit(0);
	}
	close(fd[1]);
	/* Put in its own process group (race with setpgid above) */
	if (setpgid(pid, pid) == -1) {
		perror("parent setpgid");
	}

	// Ignore SIGCHLD and flush pending waiting process
	signal(SIGCHLD, SIG_IGN);
	while(1) {
		int wstatus;
		pid_t waitPidRet = waitpid(-1, &wstatus, WNOHANG);
		if (waitPidRet > 0) {
			continue;
		}
		if (waitPidRet == 0) {
			break;
		}
		if (errno == EINTR) {
			continue;
		}
		perror("waitpid");
		break;
	}

	Client * worker = new Client(this, fd[0], pid);
	worker->worker = true;
	clients.insert(worker);
	std::cerr << "New worker started: "<<  worker->identifier() << "\n";
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

void SharedCacheServer::evict(CacheFileDesc * item)
{
	std::cerr << "Server evicts " << item->filename << " of size " << item->size << " used at " << item->lastUse << "\n";
	currentSize -= item->size;
	item->unlink();
	delete(item);
}

int SharedCacheServer::nextTimeout() const {
	// Find the timeout
	std::chrono::time_point<std::chrono::steady_clock> * nextTimeout = nullptr;
	for(auto it = streamWatchers.begin(); it != streamWatchers.end();)
	{
		Client * c = *(it++);

		if (c->watcherExpiry == nullptr) {
			continue;
		}
		if (nextTimeout == nullptr || *(c->watcherExpiry) < *nextTimeout) {
			nextTimeout = c->watcherExpiry;
		}
	}
	if (nextTimeout != nullptr) {
		auto timeout = *nextTimeout - std::chrono::steady_clock::now();
		auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(timeout).count();
		if (ms < 0) {
			return 0;
		}
		if (ms > 1000) {
			return 1000;
		}
		return ms;
	}
	return 1000;
}



void SharedCacheServer::server()
{
	clearWorkingDirectory();
	// sigpipe condition is handled by checking write result code
	// don't let sigpipe interrupt server
	signal(SIGPIPE, SIG_IGN);

	// Cleanup the directory
	while(true) {
		// FIXME: ensure that we never have more than two active workers (running)
		// For this, we should not answer back to getResource to workers untils they
		// the active workers is low enough

		// Always keep 2 idle workers ready to run
		while(startedWorkerCount < 2 + waitingContentWorkerCount) {
			std::cerr << "Starting new worker due to high number of consumers : " << startedWorkerCount << " with " << waitingContentWorkerCount << " stucks\n";
			startWorker();
		}

		// don't allow too many idle workers (shrink back)
		while(waitingWorkers.size() > 2) {
			// Kill some workers
			auto remove = (*waitingWorkers.begin());
			std::cerr << "Too many waiting workers (" << waitingWorkers.size() << ") ; dropping " << remove->identifier() << "\n";
			remove->release();
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

		int timeout = this->nextTimeout();
		if (poll(polls, pollCount, timeout) == -1) {
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
						c->release();
						continue;
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
						c->release();
						continue;
					}
				} else if (rd == 0 || c->activeRequest) {
					if (rd != 0) {
						std::cerr << "Client " << c->fd << " sent too much data\n";
					} else {
						std::cerr << "Client " << c->fd << " terminated\n";
					}
					c->release();
					continue;
				} else {
					// FIXME: read 0 ? possible ?
					c->readBufferPos += rd;
					if (c->readBufferPos > 2) {
						uint16_t size = *(uint16_t*)c->readBuffer;
						if (size >= MAX_MESSAGE_SIZE || size <= 2) {
							c->release();
							continue;
						} else if (size >= c->readBufferPos){
							// Process a message for the client.
							try {
								receiveMessage(c, size);

							} catch(const std::exception& ex) {
								std::cerr << "Error on client " << c->fd << ": "<< ex.what() << "\n";
								c->release();
								continue;
							}
							try {
								proceedNewMessage(c);
							} catch(const ClientError & ex) {
								std::cerr << "Error on client " << c->fd << ": "<< ex.what() << "\n";
								c->release();
								continue;
							}

						} else if (c->readBufferPos == MAX_MESSAGE_SIZE) {
							c->release();
							continue;
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
			if (result == contentByIdentifier.end() || ((!result->second->produced) && (!result->second->error))) {
				evaluator.markAsRequired(*(c->activeRequest->contentRequest), identifier);
			} else {
				CacheFileDesc * entry = result->second;
				Messages::Result resultMessage;
				resultMessage.contentResult = new Messages::ContentResult(entry->toContentResult(&(*c->activeRequest->contentRequest)));

				waitingConsumers.remove(c);
				if (c->worker) {
					waitingContentWorkerCount--;
				}
				entry->addReader();
				c->reading.push_back(entry);
				c->reply(resultMessage);
			}
		}

		ClientLoop: for(auto it = clients.begin(); it != clients.end();) {
			Client * c = (*it++);
			if (c->producing.empty()) {
				continue;
			}
			if (c->killed) {
				continue;
			}
			if (c->producedStream) {
				// Don't kill stream producers
				continue;
			}

			bool reallyUsed = false;
			for(auto producingIt = c->producing.begin(); producingIt != c->producing.end();) {
				CacheFileDesc * producing = (*producingIt++);

				if (evaluator.required(producing)) {
					reallyUsed = true;
					break;
				}
			}
			if (reallyUsed) {
				continue;
			}
			// FIXME: delay the kill call for some ms...
			// (for the case of brightness burst requests)
			c->kill();
		}

		this->checkAllStreamWatchersForTimeout();

		// Distribute some works
		// FIXME: check space is ok (ie don't start under low space condition)
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

		// Keep cache under its nominal size
		if (currentSize > maxSize) {
			long wanted = currentSize - maxSize;
			std::cerr << "Out of space condition detected. current size is " << currentSize << "/" << maxSize << "\n";

			std::list<CacheFileDesc *> removables;
			long removableSize = 0;
			for(auto it = contentByIdentifier.begin(); it != contentByIdentifier.end();)
			{
				CacheFileDesc * cfd = (it++)->second;
				if (!cfd->produced) {
					continue;
				}
				if (cfd->clientCount) {
					continue;
				}
				if (evaluator.required(cfd)) {
					// For the moment, do not drop entry that are required in the future
					// FIXME: use a level to indidcate when it will be required, then fall back to drop them
					continue;
				}

				removables.push_back(cfd);
				removableSize += cfd->size;
			}

			if (removableSize >= wanted && removables.size() > 1) {
				// Sort by last recent usage
				removables.sort(CacheFileDesc::compare_last_use);
			}

			while(wanted > 0 && removables.size()) {
				CacheFileDesc * item = removables.front();
				removables.pop_front();
				wanted -= item->size;
				evict(item);
			}
		}

	}
}
} /* namespace SharedCache */
