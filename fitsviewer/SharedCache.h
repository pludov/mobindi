#ifndef SHAREDCACHE_H
#define SHAREDCACHE_H 1

#include <string>
#include <list>
#include "json.hpp"


class FitsFile;

// create a file in /tmp (0 size)
// adjust its size
// initialize the structure
// create a semaphore
// mark it ready
namespace SharedCache {
	const int MAX_MESSAGE_SIZE = 32768;
	class Entry;

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
		void operator=(const ChildPtr<M> & value) {
			this->operator=(value.ptr == nullptr ? nullptr : new M(*value.ptr));
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
		struct Writable {
			Writable();
			virtual ~Writable();
			virtual void collectMemfd(std::vector<int*> & content);

			virtual void to_json(nlohmann::json&j) const = 0;
			virtual void from_json(const nlohmann::json& j) = 0;
		};

		void to_json(nlohmann::json&j, const Writable & i);
		void from_json(const nlohmann::json& j, Writable & p);

		struct RawContent: public Writable {
			std::string path;
			std::string stream;
			// Used for video content, to get a specific serial (default to 0)
			long serial;
			// Need exactly this serial - fixme: this must not enter the key
			bool exactSerial;

			void produce(Entry * entry);
			static void readFits(FitsFile & fitsFile, Entry * entry);

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};


		struct Histogram: public Writable {
			RawContent source;
			void produce(Entry * entry);

			void collectRawContents(std::list<RawContent *> & into);

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct StarOccurence: public Writable {
			double x, y;
			double fwhm, stddev, flux;
			double maxFwhm, maxStddev, maxFwhmAngle;
			double minFwhm, minStddev, minFwhmAngle;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct StarField: public Writable {
			RawContent source;
			void produce(Entry * entry);

			void collectRawContents(std::list<RawContent *> & into);

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct StarFieldResult: public Writable {
			int width, height;
			std::vector<StarOccurence> stars;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct AstrometryResult: public Writable {
			bool found;
			double raCenter, decCenter;
			double refPixX, refPixY;
			double cd1_1,cd1_2, cd2_1, cd2_2;
			int width, height;
			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct Astrometry: public Writable {
			StarField source;
			std::string exePath;
			std::string libraryPath;
			double fieldMin, fieldMax;
			double searchRadius;
			double raCenterEstimate, decCenterEstimate;
			int numberOfBinInUniformize;

			void produce(Entry * entry);

			void collectRawContents(std::list<RawContent *> & into);
			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		// These queries produce json output
		struct JsonQuery: public Writable {
			ChildPtr<StarField> starField;
			ChildPtr<Astrometry> astrometry;
			void produce(Entry * entry);

			void collectRawContents(std::list<RawContent *> & into);

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct ContentRequest: public Writable {
			ChildPtr<RawContent> fitsContent;
			ChildPtr<Histogram> histogram;
			ChildPtr<JsonQuery> jsonQuery;

			std::string uniqKey();

			void produce(Entry * entry);

			void collectRawContents(std::list<RawContent *> & into);

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		// Wait until a stream frame gets obsoleted
		struct StreamWatchRequest: public Writable {
			std::string stream;
			long serial;
			int timeout;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		// Wait until a stream frame gets obsoleted
		struct StreamWatchResult: public Writable {
			bool timedout;
			bool dead;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct WorkRequest: public Writable {
			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};


		struct WorkResponse: public Writable {
			ChildPtr<ContentRequest> content;
			std::string uuid;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct FinishedAnnounce: public Writable {
			bool error;
			long size;
			std::string uuid;
			int memfd;
			std::string errorDetails;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
			virtual void collectMemfd(std::vector<int*> & content);
		};

		struct ReleasedAnnounce: public Writable {
			std::string uuid;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct StreamStartImageRequest: public Writable {
			std::string streamId;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct StreamStartImageResult: public Writable {
			std::string streamId;
			std::string uuid;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct StreamPublishRequest: public Writable {
			long size;
			int memfd;
			std::string uuid;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
			virtual void collectMemfd(std::vector<int*> & content);
		};

		struct StreamPublishResult: public Writable {
			long serial;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
		};

		struct Request: public Writable {
			ChildPtr<ContentRequest> contentRequest;
			ChildPtr<StreamWatchRequest> streamWatchRequest;
			ChildPtr<WorkRequest> workRequest;
			ChildPtr<FinishedAnnounce> finishedAnnounce;
			ChildPtr<ReleasedAnnounce> releasedAnnounce;
			ChildPtr<StreamStartImageRequest> streamStartImageRequest;
			ChildPtr<StreamPublishRequest> streamPublishRequest;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
			virtual void collectMemfd(std::vector<int*> & content);
		};

		// Return a content key (a file).
		// if not ready, it is up to the caller to actually produce the content
		struct ContentResult: public Writable {
			bool error;
			std::string uuid;
			int memfd;
			std::string errorDetails;
			ChildPtr<ContentRequest> actualRequest;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
			virtual void collectMemfd(std::vector<int*> & content);
		};

		struct Result: public Writable {
			ChildPtr<ContentResult> contentResult;
			ChildPtr<StreamWatchResult> streamWatchResult;
			ChildPtr<WorkResponse> todoResult;
			ChildPtr<StreamStartImageResult> streamStartImageResult;
			ChildPtr<StreamPublishResult> streamPublishResult;

			virtual void to_json(nlohmann::json&j) const;;
			virtual void from_json(const nlohmann::json& j);
			virtual void collectMemfd(std::vector<int*> & content);
		};
	}

	/** Reference to an Entry. Auto release */
	class EntryRef {
		Entry * entry;
	public:
		EntryRef(Entry * entry);
		~EntryRef();

		operator Entry*() {return entry;}
		Entry * operator->() { return entry; }

		// No sharing...
		EntryRef(const EntryRef & other) = delete;
		void operator=(const EntryRef & other) = delete;
	};

	class Cache;
	class Entry {
		friend class Cache;
		friend class EntryRef;
		friend class SharedCacheServer;
		std::string uuid;
		std::string streamId;
		long serial;
		bool wasReady;
		Cache * cache;
		bool wasMmapped;
		void * mmapped;
		unsigned long int dataSize;
		int fd;

		bool error;
		std::string errorDetails;

		// either one of produced/failed/release was already called
		bool released;

		ChildPtr<Messages::ContentRequest> actualRequest;

		Entry(Cache * cache, const Messages::ContentResult & result);
		Entry(Cache * cache, const Messages::WorkResponse & tobuild);
		Entry(Cache * cache, const Messages::StreamStartImageResult & tobuild);
		void open();
	public:
		~Entry();

		bool ready() const;
		void produced();
		SharedCache::Messages::StreamPublishResult streamPublish();
		void failed(const std::string & str);
		void release();

		void allocate(unsigned long int size);
		void * data();
		unsigned long int size();

		bool hasError() const { return error; };
		std::string getErrorDetails() const { return errorDetails; };
		std::string getStreamId() const { return streamId; };
		const ChildPtr<Messages::ContentRequest> & getActualRequest() const;

		Cache * getServer() const;
	};

	class Cache {
		friend class Entry;
		friend class SharedCacheServer;
		std::string basePath;
		int clientFd;
		long maxSize;

		int write(Messages::Writable & message);
		int read(Messages::Writable & expected);
		static int write(int fd, Messages::Writable & alteredMessage);
		static int read(int fd, Messages::Writable & expected);
		Messages::Result clientSend(const Messages::Request & request);

		// Try to connect
		void init();
		bool connectExisting();

		Cache(const std::string & path, long maxSize, int fd);

	public:
		Cache(const std::string & path, long maxSize);

		Entry * getEntry(const Messages::ContentRequest & wanted);
		Entry * startStreamImage();
		bool waitStreamFrame(const std::string streamId, long serial, int timeout, bool & dead);

		static void setSockAddr(const std::string basePath, struct sockaddr_un & addr);
	};
}

#endif
