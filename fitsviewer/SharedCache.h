#ifndef SHAREDCACHE_H
#define SHAREDCACHE_H 1

#include <string>
#include "json.hpp"

// create a file in /tmp (0 size)
// adjust its size
// initialize the structure
// create a semaphore
// mark it ready
namespace SharedCache {
	class Entry {
		friend class Cache;

		uint32_t entryId;
		bool ready;
		void * data;

		void allocate(uint32_t size);
		void done();
		void cancel();

		Entry(uint32_t entryId, void * data, bool ready);
	public:
		bool ready() const;

		// During production (ie when !ready())
		void allocate(uint32_t size);
		// During production (ie when !ready())
		void done();

		// When usage is done
		void release();
	};

	class Cache {
		class Lock {
			int lockCount;
		public:
			Lock();
			~Lock();
			void lock();
			void unlock();
			void release();
		};

		int fd;
		void * buffer;
		uint32_t bufferSize;
		uint32_t entryCount;
		std::string path;
		bool attach();

		int lockCount;

		// assume the file exists.
		bool joinExisting();

		void lock();
		void unlock();
	public:
		Cache(uint32_t bufferSize);

		Entry * prepare(const nlohmann::json & json);
	};
}

#endif
