#include <sys/types.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/mman.h>
#include <sys/file.h>

#include <stdint.h>

#include "SharedCache.h"

#define ENTRY_PRODUCING 1

// Autre approche:
//   un process ouvre un socket/serveur et un répertoire contenant les données
//   il autorise les traitement et donne les noms des fichiers
//   il assure que la taille utilisée ne dépasse pas un seuil donnée















// Wait for unlock:
// A process grab the lock, and mark a struct as busy, release the lock
// Another one takes the lock, see the struct "busy", then wait
// How can it wake up ?

// We can have a signal struct that indicates which process are to be notified (list of pid)
//    => require cleanup (a pid that is not there must be removed)
// Could be a table of pid=>waited_id

// Will start with sleep

#define SIGNATURE 0x7f5e221a

struct EntryDesc {
	uint32_t hash;
	uint32_t offset, length;
	// FIXME: should be a list of pids, all sets to -1
	// Or could maintain a buffer list.
	uint16_t readerCount;
	uint8_t flag;

	void init()
	{
		hash = 0;
		offset = 0;
		length = 0;
	}

	bool isProducing() const {
		return flag & ENTRY_PRODUCING;
	}

	bool canAcceptNewReaders() const {
		return readerCount < 65535;
	}
};

struct Head {
	uint32_t sig;
	uint32_t totalSize;
	uint32_t entryCount;
	EntryDesc entries[0];
};

namespace SharedCache {

	void Cache::lock()
	{
		lockCount++;
		if (lockCount == 1) {
			flock(fd, LOCK_EX);
		}
	}

	void Cache::unlock()
	{
		lockCount--;
		if (lockCount == 0) {
			flock(fd, LOCK_UN);
		}
	}

	bool Cache::attach()
	{
		fd = open(path.c_str(), O_EXCL | O_CREAT | O_RDWR, 0600);
		if (fd == -1) {
			if (errno == EEXIST) {
				return joinExisting();
			} else {
				perror(path.c_str());
				throw std::runtime_error("Failed to open shared struct");
			}
		}
		// Write the head struct.
		// Size of file, number of entry
		size_t headSize = sizeof(Head) + sizeof(EntryDesc) * (size_t)entryCount;
		Head * head = (Head*)malloc(headSize);
		if (!head) {
			close(fd);
			throw new std::runtime_error("Not enough memory");
		}
		head->sig = SIGNATURE;
		head->totalSize = bufferSize;
		head->entryCount = entryCount;
		for(int i = 0; i < entryCount; ++i) {
			head->entries[i].init();
		}
		int written;
		if ((written = write(fd, head, headSize)) != headSize) {
			if (written == -1) {
				perror("write");
			}
			close(fd);
			free(head);
			throw new std::runtime_error("Initial write failed");
		}
		free(head);

		// We just created the file. mmap it and so on
		buffer = mmap(0, fd, bufferSize, PROT_READ|PROT_WRITE, MAP_SHARED, 0);
		if (buffer == MAP_FAILED) {
			perror("mmap");
			close(fd);
			buffer = 0;
			fd = -1;
			throw new std::runtime_error("Mmap failed");
		}

		return true;
	}

	bool Cache::joinExisting()
	{
		fd = open(path.c_str(), O_RDWR);
		if (fd == -1) {
			// Could not open
			perror(path.c_str());
			throw new std::runtime_error("Failed to open shared struct");
		}
		Head head;
		int readen;
		if ((readen = read(fd, &head, sizeof(head)) ) != sizeof(head))
		{
			if (readen == -1) {
				perror("read");
			}
			close(fd);
			fd = -1;
			if (readen == -1) {
				throw new std::runtime_error("Read error");
			}
			return false;
		}
		buffer = mmap(0, fd, head.totalSize, PROT_READ|PROT_WRITE, MAP_SHARED, 0);
		if (buffer == MAP_FAILED) {
			perror("mmap");
			close(fd);
			fd = -1;
			buffer = 0;
			throw new std::runtime_error("Mmap failed");
		}
		bufferSize = head.totalSize;
	}


	// Scan the mem pool for the given identifer.
	// If not found, create an entry and return it
	Entry * Cache::getReady(const std::string & identifier)
	{
		Lock lock;
		while(true) {
			lock.lock();

			int entryId = find(identifier);
			if (entryId != -1) {
				EntryDesc * entry = getEntry(entryId);
				if (entry->isProducing() || !entry->canAcceptNewReaders()) {
					// Sit there and wait.
					lock.release();
					usleep(5000);
					continue;
				}
				entry->readerCount++;
				// Got the entry. Fine
				return new Entry(entryId, entry->getData(), true);
			}
			entryId = allocateNewEntry(identifier);
			return new Entry(entryId, entry->getData(), false);
		}
	}
}
