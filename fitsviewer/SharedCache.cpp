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
#include "SharedCache.h"
#include "SharedCacheServer.h"

namespace SharedCache {

	Entry::Entry(Cache * cache, const Messages::ContentResult & result):
			cache(cache),
			path(result.path),
			wasReady(result.ready)
	{
		mmapped = nullptr;
		dataSize = 0;
		wasMmapped = false;
		fd = -1;
	}

	Entry::Entry(Cache * cache, const Messages::WorkResponse & result):
						cache(cache),
						path(result.path),
						wasReady(false)
	{
		mmapped = nullptr;
		dataSize = 0;
		wasMmapped = false;
		fd = -1;
	}

	bool Entry::ready() const {
		return wasReady;
	}

	void Entry::open() {
		if (fd != -1) {
			return;
		}
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
			posix_fallocate(fd, 0, size);
			mmapped = mmap(0, size, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0);
			if (mmapped == MAP_FAILED) {
				perror("mmap");
				std::cerr << "mmap of fd " << fd << " for " << path << " failed\n";
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

	unsigned long int Entry::size()
	{
		this->data();
		return dataSize;
	}

	void Entry::produced() {
		Messages::Request request;
		request.finishedAnnounce = new Messages::FinishedAnnounce();
		request.finishedAnnounce->path = path;
		request.finishedAnnounce->size = dataSize;
		cache->clientSend(request);
	}

	void Entry::release() {
		Messages::Request request;
		request.releasedAnnounce = new Messages::ReleasedAnnounce();
		request.releasedAnnounce->path = path;
		cache->clientSend(request);
	}

	Cache::Cache(const std::string & path, long maxSize) :
				basePath(path)
	{
		this->maxSize = maxSize;
		init();
	}

	Cache::Cache(const std::string & path, long maxSize, int fd) :
				basePath(path)
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
		std::cerr << "Sending " << str << "\n";
		clientSendMessage(str.data(), str.length());
		char buffer[SharedCache::MAX_MESSAGE_SIZE];
		int sze = clientWaitMessage(buffer);
		std::string received(buffer, sze);
		std::cerr << "Received: " << received << "\n";
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


	bool Cache::connectExisting()
	{
		clientFd = socket(AF_UNIX, SOCK_STREAM, 0);
		if (clientFd == -1) {
			perror("socket");
			throw std::runtime_error("socket");
		}
		struct sockaddr_un addr;
		setSockAddr(basePath, addr);

		if (connect(clientFd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
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

	void Cache::setSockAddr(const std::string basePath, struct sockaddr_un & addr)
	{
		memset(&addr, 0, sizeof(addr));
		addr.sun_family = AF_UNIX;
		strncpy(addr.sun_path + 1, basePath.c_str(), sizeof(addr.sun_path)-2);
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
		for(int i = 0; i < 3; ++i) {
			if (i > 0) usleep(5000);
			(new SharedCacheServer(basePath, maxSize))->init();
			if (connectExisting()) {
				return;
			}
		}
		throw new std::runtime_error("Failed to connect to server");
	}

}
