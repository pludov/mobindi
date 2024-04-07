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
#include <stdlib.h>
#include <signal.h>
#include <assert.h>
#include <iostream>
#include "ChildProcess.h"
#include "SharedCache.h"
#include "SharedCacheServer.h"

namespace SharedCache {
	EntryRef::EntryRef(Entry * e) :entry(e) {
	}

	EntryRef::~EntryRef() {
		if (!entry->released) {
			entry->release();
		}
		delete(entry);
	}


	Entry::Entry(Cache * cache, const Messages::ContentResult & result):
			cache(cache),
			filename(result.filename),
			wasReady(true),
			streamId(),
			actualRequest(result.actualRequest)
	{
		mmapped = nullptr;
		dataSize = 0;
		wasMmapped = false;
		fd = -1;
		if (!result.error) {
			error = false;
			errorDetails = "";
			released = false;
			
		} else {
			error = true;
			errorDetails = result.errorDetails;
			released = true;
		}

	}

	Entry::Entry(Cache * cache, const Messages::WorkResponse & result):
						cache(cache),
						filename(result.filename),
						wasReady(false),
						error(false),
						streamId()
	{
		mmapped = nullptr;
		dataSize = 0;
		wasMmapped = false;
		released = false;
		fd = -1;
	}

	Entry::Entry(Cache * cache, const Messages::StreamStartImageResult & result):
						cache(cache),
						filename(result.filename),
						wasReady(false),
						error(false),
						streamId(result.streamId)
	{
		mmapped = nullptr;
		dataSize = 0;
		wasMmapped = false;
		released = false;
		fd = -1;
	}

	Entry::~Entry()
	{
		if (wasMmapped && mmapped) {
			munmap(mmapped, dataSize);
		}
		if (fd != -1) {
			close(fd);
		}
	}

	bool Entry::ready() const {
		return wasReady;
	}

	void Entry::open() {
		if (fd != -1) {
			return;
		}
		std::string path = cache->basePath  + filename;
		fd = ::open(path.c_str(), O_CLOEXEC | (wasReady ? O_RDONLY : O_RDWR));
		if (fd == -1) {
			perror(path.c_str());
			throw std::runtime_error("Failed to open data file");
		}
	}

	void Entry::allocate(unsigned long int size)
	{
		assert(!wasReady);
		assert(!wasMmapped);
		open();
		wasMmapped = true;
		if (size) {
			if (posix_fallocate(fd, 0, size) == -1) {
				perror("fallocate");
				std::cerr << "fallocate failed for " << filename << " failed\n";
				throw std::runtime_error("fallocate failed");
			}

			mmapped = mmap(0, size, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0);
			if (mmapped == MAP_FAILED) {
				perror("mmap");
				std::cerr << "mmap of fd " << fd << " for " << filename << " failed\n";
				throw std::runtime_error("Mmap failed");
			}
		}
		dataSize = size;
	}

	void * Entry::data() {
		if (!wasMmapped) {
			open();
			struct stat statbuf;
			if (fstat(fd, &statbuf) == -1) {
				perror("stat");
				throw std::runtime_error("Unable to stat file");
			}

			dataSize = statbuf.st_size;
			if (dataSize > 0) {
				mmapped = mmap(0, dataSize, PROT_READ, MAP_SHARED, fd, 0);
				if (mmapped == MAP_FAILED) {
					perror("mmap");
					throw std::runtime_error("Mmap failed");
				}
			}
			wasMmapped = true;
		}
		return mmapped;
	}

	Cache * Entry::getServer() const {
		return cache;
	}

	unsigned long int Entry::size()
	{
		this->data();
		return dataSize;
	}

	void Entry::produced() {
		Messages::Request request;
		request.finishedAnnounce = new Messages::FinishedAnnounce();
		request.finishedAnnounce->filename = filename;
		request.finishedAnnounce->size = dataSize;
		request.finishedAnnounce->error = false;
		request.finishedAnnounce->errorDetails = "";
		cache->clientSend(request);
		released = true;
	}

	SharedCache::Messages::StreamPublishResult Entry::streamPublish() {
		Messages::Request request;
		request.streamPublishRequest = new Messages::StreamPublishRequest();
		request.streamPublishRequest->filename = filename;
		request.streamPublishRequest->size = dataSize;
		SharedCache::Messages::Result result = cache->clientSend(request);
		released = true;

		return *result.streamPublishResult;
	}

	void Entry::failed(const std::string & str) {
		Messages::Request request;
		request.finishedAnnounce = new Messages::FinishedAnnounce();
		request.finishedAnnounce->filename = filename;
		request.finishedAnnounce->size = 0;
		request.finishedAnnounce->error = true;
		request.finishedAnnounce->errorDetails = str;
		cache->clientSend(request);
		released = true;
	}

	void Entry::release() {
		Messages::Request request;
		request.releasedAnnounce = new Messages::ReleasedAnnounce();
		request.releasedAnnounce->filename = filename;
		cache->clientSend(request);
		released = true;
	}

	const ChildPtr<Messages::ContentRequest> & Entry::getActualRequest() const {
		return actualRequest;
	}


	static void getCacheLocation(std::string & basePath, long & maxSize) {
		const char * envCachePath = getenv("FITS_SERVER_CACHE_PATH");
		const char * envCacheSize = getenv("FITS_SERVER_CACHE_SIZE");

		if (envCachePath == nullptr) {
			envCachePath = "/tmp/fits-server.cache";
		}
		if (envCacheSize == nullptr) {
			envCacheSize = "128M";
		}


		basePath = envCachePath;
		maxSize = atoll(envCacheSize);
		auto envCacheSizeLen = strlen(envCacheSize);
		char unit = envCacheSizeLen ? envCacheSize[envCacheSizeLen - 1] : 0;
		switch(unit) {
			case 'G':
				maxSize *= 1024;
			case 'M':
				maxSize *= 1024;
			case 'K':
				maxSize *= 1024;
		}

		if (basePath.length() == 0 || basePath[0] != '/') {
			throw std::runtime_error("invalid cache path: " + std::string(envCachePath));
		}

		if (basePath[basePath.length() - 1] != '/') {
			basePath += '/';
		}

		if (maxSize < 65536) {
			throw std::runtime_error("invalid cache size: " + std::string(envCacheSize));
		}
	}

	Cache::Cache() :
				basePath()
	{
		getCacheLocation(basePath, maxSize);



		init();
	}

	Cache::Cache(const SharedCacheServer & parent, int fd) :
				basePath(parent.getBasePath())
	{
		this->maxSize = maxSize;
		this->clientFd = fd;
	}

	Messages::Result Cache::clientSend(const Messages::Request & request)
	{
		std::string str;
		{
			nlohmann::json j = request;
			str = j.dump();
		}
		std::cerr << getpid() << ": Sending to server: " << str << "\n";
		clientSendMessage(str.data(), str.length());
		char buffer[SharedCache::MAX_MESSAGE_SIZE];
		int sze = clientWaitMessage(buffer);
		std::string received(buffer, sze);
		std::cerr << getpid() << ": Received from server: " << received << "\n";
		auto jsonResult = nlohmann::json::parse(received);
		return jsonResult.get<Messages::Result>();
	}

	Entry * Cache::getEntry(const Messages::ContentRequest & wanted)
	{
		Messages::Request request;
		request.contentRequest = new Messages::ContentRequest(wanted);

		Messages::Result r = clientSend(request);
		return new Entry(this, *r.contentResult);
	}

	bool Cache::waitStreamFrame(const std::string streamId, long serial, int timeout, bool & dead)
	{
		Messages::Request request;
		request.streamWatchRequest.build();
		request.streamWatchRequest->stream = streamId;
		request.streamWatchRequest->serial = serial;
		request.streamWatchRequest->timeout = timeout;

		Messages::Result r = clientSend(request);
		dead = r.streamWatchResult->dead;
		return !r.streamWatchResult->timedout;
	}

	Entry * Cache::startStreamImage()
	{
	    SharedCache::Messages::Request request;
		request.streamStartImageRequest.build();
		Messages::Result r = clientSend(request);
		return new Entry(this, *r.streamStartImageResult);
	}


	bool Cache::connectExisting()
	{
		clientFd = socket(AF_UNIX, SOCK_STREAM, 0);
		if (clientFd == -1) {
			perror("socket");
			throw std::runtime_error("socket");
		}
		struct sockaddr_un addr;
		int len;
		setSockAddr(basePath, addr, len);

		if (connect(clientFd, (struct sockaddr*)&addr, len) == -1) {
			if (errno == ECONNREFUSED) {
				close(clientFd);
				return false;
			}
			perror("connect");
			throw std::runtime_error("connect");
		}
		return true;
	}

	void Cache::clientSendMessage(const void * data, int length)
	{
		if (length > MAX_MESSAGE_SIZE - 2) {
			throw std::runtime_error("Message too big");
		}
		uint16_t size = length + 2;
		int wr = write(clientFd, &size, 2);
		if (wr == -1) {
			perror("write");
			throw std::runtime_error("write");
		}
		if (wr < 2) {
			throw std::runtime_error("short write");
		}

		wr = write(clientFd, data, length);
		if (wr == -1) {
			perror("write");
			throw std::runtime_error("write");
		}
		if (wr < length) {
			throw std::runtime_error("short write");
		}
	}

	int Cache::clientWaitMessage(char * buffer)
	{
		uint16_t size;
		int readen = read(clientFd, &size, 2);
		if (readen == -1) {
			perror("read");
			throw std::runtime_error("read");
		}
		if (readen < 2) {
			throw std::runtime_error("short read");
		}
		if (size > MAX_MESSAGE_SIZE) {
			throw std::runtime_error("invalid size");
		}
		readen = read(clientFd, buffer, size);
		if (readen == -1) {
			perror("read");
			throw std::runtime_error("read");
		}
		if (readen < size) {
			throw std::runtime_error("short read");
		}
		return size;
	}

	void Cache::setSockAddr(const std::string basePath, struct sockaddr_un & addr, int & len)
	{
		memset(&addr, 0, sizeof(addr));
		addr.sun_family = AF_UNIX;
		strncpy(addr.sun_path + 1, basePath.c_str(), sizeof(addr.sun_path)-1);
		len = offsetof(struct sockaddr_un, sun_path) + basePath.size() + 1;
	}

	void Cache::init()
	{
		int rslt = mkdir(basePath.c_str(), 0777);
		if (rslt == -1 && errno != EEXIST) {
			perror(basePath.c_str());
			throw std::runtime_error("Unable to create cache directory");
		}


		if (connectExisting()) {
			return;
		}

		// Attempt to start the server
		for(int i = 0; i < 3; ++i) {
			if (i > 0) usleep(5000);

			// Find the path for fits-server.
			std::string fitsServerExe = locateExe("fits-server");

			std::vector<std::string> args;
			args.push_back(basePath);
			args.push_back(std::to_string(maxSize));

			try {
				system(fitsServerExe, args);
			} catch(SharedCache::WorkerError e) {
				// Ignore errors here since we'll retry anyway
			}

			if (connectExisting()) {
				return;
			}
		}
		throw std::runtime_error("Failed to connect to server");
	}

}
