#include <sys/types.h>
#include <sys/stat.h>
#include <linux/memfd.h>
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

#define MAXFD_PER_MESSAGE 16

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
			fd(result.memfd),
			uuid(result.uuid),
			wasReady(true),
			streamId(),
			actualRequest(result.actualRequest)
	{
		mmapped = nullptr;
		dataSize = 0;
		wasMmapped = false;
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
						uuid(result.uuid),
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
						uuid(result.uuid),
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

	void Entry::allocate(unsigned long int size)
	{
		assert(!wasReady);
		assert(!wasMmapped);
		assert(fd == -1);
		// FIXME: seal fd...
		fd = memfd_create("buffer", MFD_CLOEXEC);
		if (fd == -1) {
			perror("memfd_create");
			std::cerr << "unable to create buffer\n";
			throw std::runtime_error("memfd_create failed");
		}
		wasMmapped = true;
		if (size) {
			posix_fallocate(fd, 0, size);
			mmapped = mmap(0, size, PROT_READ|PROT_WRITE, MAP_SHARED, fd, 0);
			if (mmapped == MAP_FAILED) {
				perror("mmap");
				std::cerr << "mmap of fd " << fd << " for " << uuid << " failed\n";
				throw std::runtime_error("Mmap failed");
			}
		}
		dataSize = size;
	}

	void * Entry::data() {
		assert(fd != -1);
		if (!wasMmapped) {
			struct stat statbuf;
			if (fstat(fd, &statbuf) == -1) {
				perror("stat");
				throw std::runtime_error("Unable to stat buffer");
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
		request.finishedAnnounce->memfd = fd;
		request.finishedAnnounce->uuid = uuid;
		request.finishedAnnounce->size = dataSize;
		request.finishedAnnounce->error = false;
		request.finishedAnnounce->errorDetails = "";
		cache->clientSend(request);
		released = true;
	}

	SharedCache::Messages::StreamPublishResult Entry::streamPublish() {
		Messages::Request request;
		request.streamPublishRequest = new Messages::StreamPublishRequest();
		request.streamPublishRequest->memfd = fd;
		request.streamPublishRequest->uuid = uuid;
		request.streamPublishRequest->size = dataSize;
		SharedCache::Messages::Result result = cache->clientSend(request);
		released = true;

		return *result.streamPublishResult;
	}

	void Entry::failed(const std::string & str) {
		Messages::Request request;
		request.finishedAnnounce = new Messages::FinishedAnnounce();
		request.finishedAnnounce->memfd = -1;
		request.finishedAnnounce->uuid = uuid;
		request.finishedAnnounce->size = 0;
		request.finishedAnnounce->error = true;
		request.finishedAnnounce->errorDetails = str;
		cache->clientSend(request);
		released = true;
	}

	void Entry::release() {
		if (uuid.length()) {
			Messages::Request request;
			request.releasedAnnounce = new Messages::ReleasedAnnounce();
			request.releasedAnnounce->uuid = uuid;
			cache->clientSend(request);
		}
		released = true;
	}

	const ChildPtr<Messages::ContentRequest> & Entry::getActualRequest() const {
		return actualRequest;
	}


	Cache::Cache(const std::string & path, long maxSize) :
				basePath(path)
	{
		this->maxSize = maxSize;
		if (basePath.length() == 0 || basePath[0] != '/') {
			throw std::runtime_error("invalide base path");
		}

		if (basePath[basePath.length() - 1] != '/') {
			basePath += '/';
		}

		init();
	}

	Cache::Cache(const std::string & path, long maxSize, int fd) :
				basePath(path)
	{
		this->maxSize = maxSize;
		this->clientFd = fd;
	}

	int Cache::write(Messages::Writable & message) {
		return write(this->clientFd, message);
	}

	int Cache::write(int clientFd, Messages::Writable & message) {
		std::vector<int*> rawMemfdList;
		message.collectMemfd(rawMemfdList);

		std::vector<int*> memfdList;
		for(int i = 0; i < rawMemfdList.size(); ++i) {
			if ((*rawMemfdList[i]) != -1) {
				memfdList.push_back(rawMemfdList[i]);
			}
		}
		struct msghdr msgh;
		struct iovec iov;
		int cmsghdrlength;
		struct cmsghdr * cmsgh;

		if (memfdList.size() > 0) {
			if (memfdList.size() > MAXFD_PER_MESSAGE) {
				errno = EMSGSIZE;
				return -1;
			}
			cmsghdrlength = CMSG_SPACE((memfdList.size() * sizeof(int)));
			cmsgh = (cmsghdr*)malloc(cmsghdrlength);

			/* Write the fd as ancillary data */
			cmsgh->cmsg_len = CMSG_LEN(sizeof(int));
			cmsgh->cmsg_level = SOL_SOCKET;
			cmsgh->cmsg_type = SCM_RIGHTS;
			msgh.msg_control = cmsgh;
			msgh.msg_controllen = cmsghdrlength;
			for(int i = 0; i < memfdList.size(); ++i) {
				int fd = *memfdList[i];
				((int *) CMSG_DATA(CMSG_FIRSTHDR(&msgh)))[i] = fd;
				*memfdList[i] = i;
			}
		} else {
			cmsgh = nullptr;
			cmsghdrlength = 0;
			msgh.msg_control = cmsgh;
			msgh.msg_controllen = cmsghdrlength;
		}

		std::string str;
		{
			nlohmann::json j = message;
			str = j.dump();
		}
		if (str.length() > MAX_MESSAGE_SIZE) {
			free(cmsgh);
			errno = EMSGSIZE;
			return -1;
		}
		std::cerr << getpid() << ": Sending to " << clientFd << " : " << str << "\n";

		iov.iov_base = str.data();
		iov.iov_len = str.size();
		msgh.msg_flags = 0;
		msgh.msg_name = NULL;
		msgh.msg_namelen = 0;
		msgh.msg_iov = &iov;
		msgh.msg_iovlen = 1;
		
		int ret = sendmsg(clientFd, &msgh, 0);

		free(cmsgh);

		return ret;
	}

	int Cache::read(Messages::Writable & message) {
		return read(this->clientFd, message);
	}

	int Cache::read(int clientFd, Messages::Writable & message) {
		struct msghdr msgh;
		struct iovec iov;
		void * buffer = malloc(MAX_MESSAGE_SIZE);
		if (buffer == nullptr) {
			throw new std::runtime_error("not enough memory");
		}
		int * fd = nullptr;
		int fdCount = 0;
		int ret = -1;

		union {
			struct cmsghdr cmsgh;
			/* Space large enough to hold an 'int' */
			char   control[CMSG_SPACE(MAXFD_PER_MESSAGE * sizeof(int))];
		} control_un;
		struct cmsghdr *cmsgh;

		iov.iov_base = buffer;
		iov.iov_len = MAX_MESSAGE_SIZE;

		msgh.msg_name = NULL;
		msgh.msg_namelen = 0;
		msgh.msg_iov = &iov;
		msgh.msg_iovlen = 1;
		msgh.msg_flags = 0;
		msgh.msg_control = control_un.control;
		msgh.msg_controllen = sizeof(control_un.control);

		int size = recvmsg(clientFd, &msgh, MSG_CMSG_CLOEXEC);
		if (size == -1) {
			goto End;
		}

		cmsgh = CMSG_FIRSTHDR(&msgh);
		if (cmsgh) {
			if (cmsgh->cmsg_level != SOL_SOCKET) {
				throw std::runtime_error("invalid cmsg_level");
			}

			if (cmsgh->cmsg_type != SCM_RIGHTS) {
				throw std::runtime_error("invalid cmsg_type");
			}
			while(CMSG_LEN(sizeof(int) * fdCount) < cmsgh->cmsg_len) {
				fdCount++;
			}
			fd = ((int *) CMSG_DATA(cmsgh));
		} else {
			fdCount = 0;
			fd = nullptr;
		}

		try {
			if (size > 0) {
				nlohmann::json jsonResult;
				{
					std::string content((char*)buffer, size);
					std::cerr << getpid() << ": Received from " << clientFd << " : " << content << "\n";
					jsonResult = nlohmann::json::parse(content);
				}
				message.from_json(jsonResult);

				std::vector<int*> memfds;
				message.collectMemfd(memfds);
				for(int i = 0; i < memfds.size(); ++i) {
					int fdId = *(memfds[i]);
					if (fdId == -1) {
						continue;
					}
					if (fdId < 0 || fdId >= fdCount) {
						throw std::runtime_error("invalid fd in message");
					}
					if (fd[fdId] == -1) {
						throw std::runtime_error("duplicated fd in message");
					}
					*memfds[i] = fd[fdId];
					fd[fdId] = -1;
				}
			}
		} catch(...) {
			for(int i = 0; i < fdCount; ++i) {
				if (fd[i] != -1) {
					close(fd[i]);
				}
			}
			free(buffer);
			throw;
		}
		ret = size > 0 ? 1 : 0;

	End:
		int tmpErrno = errno;
		for(int i = 0; i < fdCount; ++i) {
			if (fd[i] != -1) {
				std::cerr << "!!!!!!!!!!!!!!! closing leftover fd\n";
				::close(fd[i]);
			}
		}
		free(buffer);
		errno = tmpErrno;
		return ret;
	}


	Messages::Result Cache::clientSend(const Messages::Request & request)
	{
		Messages::Request altered(request);
		if (write(altered) == -1) {
			perror("sendmsg");
			throw std::runtime_error("sendmsg failed");
		}

		Messages::Result result;
		if (read(result) == -1) {
			perror("recvmsg");
			throw std::runtime_error("recvmsg failed");
		}
		return result;
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
		clientFd = socket(AF_UNIX, SOCK_SEQPACKET, 0);
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

	void Cache::setSockAddr(const std::string basePath, struct sockaddr_un & addr)
	{
		memset(&addr, 0, sizeof(addr));
		addr.sun_family = AF_UNIX;
		strncpy(addr.sun_path + 1, basePath.c_str(), sizeof(addr.sun_path)-2);
	}

	void Cache::init()
	{
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
		throw std::runtime_error("Failed to connect to server");
	}

}
