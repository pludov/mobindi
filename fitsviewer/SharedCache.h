#ifndef SHAREDCACHE_H
#define SHAREDCACHE_H 1

#include <string>
#include <list>
#include "json.hpp"

// create a file in /tmp (0 size)
// adjust its size
// initialize the structure
// create a semaphore
// mark it ready
namespace SharedCache {
	const int MAX_MESSAGE_SIZE = 32768;

	template<class M> class ChildPtr {
		M*ptr;
	public:
		ChildPtr() {
			ptr = nullptr;
		}

		ChildPtr(const ChildPtr<M> & copy)
		{
			if (copy.ptr == nullptr) {
				this->ptr = nullptr;
			} else {
				this->ptr = new M(*copy.ptr);
			}
		}

		~ChildPtr() {
			delete ptr;
		}

		M * build() {
			this->operator=(new M());
			return ptr;
		}

		void clear() {
			this->operator=(nullptr);
		}

		void operator=(M* value) {
			if (value == this->ptr) return;
			M* old = this->ptr;
			this->ptr = value;
			delete old;
		}

		M & operator*() const{
			return *ptr;
		}

		M * operator->() const {
			return ptr;
		}

		operator bool() const {
			return ptr != nullptr;
		}
	};

	namespace Messages {

		struct FitsContent {
			std::string path;
		};

		void to_json(nlohmann::json&j, const FitsContent & i);
		void from_json(const nlohmann::json& j, FitsContent & p);

		struct ContentRequest {
			ChildPtr<FitsContent> fitsContent;

			std::string uniqKey() const
			{
				nlohmann::json debug = *this;
				return debug.dump(0);
			}
		};

		void to_json(nlohmann::json&j, const ContentRequest & i);
		void from_json(const nlohmann::json& j, ContentRequest & p);

		struct FinishedAnnounce {
			long size;
			std::string path;
		};

		void to_json(nlohmann::json&j, const FinishedAnnounce & i);
		void from_json(const nlohmann::json& j, FinishedAnnounce & p);

		struct ReleasedAnnounce {
			std::string path;
		};

		void to_json(nlohmann::json&j, const ReleasedAnnounce & i);
		void from_json(const nlohmann::json& j, ReleasedAnnounce & p);

		struct Request {
			ChildPtr<ContentRequest> contentRequest;
			ChildPtr<FinishedAnnounce> finishedAnnounce;
			ChildPtr<ReleasedAnnounce> releasedAnnounce;
		};

		void to_json(nlohmann::json&j, const Request & i);
		void from_json(const nlohmann::json& j, Request & p);

		// Return a content key (a file).
		// if not ready, it is up to the caller to actually produce the content
		struct ContentResult {
			std::string path;
			bool ready;
		};

		void to_json(nlohmann::json&j, const ContentResult & i);
		void from_json(const nlohmann::json& j, ContentResult & p);

		struct Result {
			ChildPtr<ContentResult> contentResult;
			ChildPtr<ContentResult> todoResult;
		};

		void to_json(nlohmann::json&j, const Result & i);
		void from_json(const nlohmann::json& j, Result & p);

	}


	class Cache;
	class Entry {
		friend class Cache;
		std::string path;
		bool wasReady;
		Cache * cache;
		bool wasMmapped;
		void * mmapped;
		unsigned long int dataSize;
		int fd;

		Entry(Cache * cache, const Messages::ContentResult & result);
		void open();
	public:

		bool ready() const;
		void produced(uint32_t size);
		void release();

		void allocate(unsigned long int size);
		void * data();
		unsigned long int size();

		const std::string & getPath() const {
			return path;
		}
	};

	class Cache {
		friend class Entry;
		std::string basePath;
		int clientFd;
		long maxSize;

		// Wait a message and returns its size
		int clientWaitMessage(char * buffer);
		void clientSendMessage(const void * data, int length);
		Messages::Result clientSend(const Messages::Request & request);

		// Try to connect
		void init();
		bool connectExisting();

	public:
		Cache(const std::string & path, long maxSize);

		Entry * getEntry(const Messages::ContentRequest & wanted);

		static void setSockAddr(const std::string basePath, struct sockaddr_un & addr);
	};
}

#endif
