#ifndef SHAREDCACHE_H
#define SHAREDCACHE_H 1

#include <string>
#include <list>
#include <vector>
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

		struct RawContent {
			std::string path;
			std::string stream;
			// Used for video content, to get a specific serial (default to 0)
			long serial;
			// Need exactly this serial - fixme: this must not enter the key
			bool exactSerial;

			void produce(Entry * entry);
			static void readFits(FitsFile & fitsFile, Entry * entry);
		};

		void to_json(nlohmann::json&j, const RawContent & i);
		void from_json(const nlohmann::json& j, RawContent & p);

		struct Histogram {
			RawContent source;
			void produce(Entry * entry);

			void collectRawContents(std::list<RawContent *> & into);

			bool asJsonResult(Entry * e, nlohmann::json& j, const nlohmann::json & options) const;
		};

		void to_json(nlohmann::json&j, const Histogram & i);
		void from_json(const nlohmann::json& j, Histogram & p);

		struct HistogramOptions {
			int maxBits = -1;
		};

		void from_json(const nlohmann::json& j, HistogramOptions & p);

		struct StarOccurence {
			double x, y;
			double peak;
			double fwhm, stddev, flux;
			double maxFwhm, maxStddev, maxFwhmAngle;
			double minFwhm, minStddev, minFwhmAngle;
		};

		void to_json(nlohmann::json&j, const StarOccurence & i);
		void from_json(const nlohmann::json&j, StarOccurence & i);

		struct StarField {
			RawContent source;
			void produce(Entry * entry);

			void collectRawContents(std::list<RawContent *> & into);
		};
		void to_json(nlohmann::json&j, const StarField & i);
		void from_json(const nlohmann::json& j, StarField & p);

		struct StarFieldResult {
			int width, height;
			std::vector<StarOccurence> stars;
		};
		void to_json(nlohmann::json&j, const StarFieldResult & i);
		void from_json(const nlohmann::json& j, StarFieldResult & p);

		struct AstrometryResult {
			bool found;
			double raCenter, decCenter;
			double refPixX, refPixY;
			double cd1_1,cd1_2, cd2_1, cd2_2;
			int width, height;
		};
		void to_json(nlohmann::json&j, const AstrometryResult & i);
		void from_json(const nlohmann::json& j, AstrometryResult & p);

		struct Astrometry {
			StarField source;
			std::string exePath;
			std::string libraryPath;
			double fieldMin, fieldMax;
			double searchRadius;
			double raCenterEstimate, decCenterEstimate;
			int numberOfBinInUniformize;

			void produce(Entry * entry);

			void collectRawContents(std::list<RawContent *> & into);
		};
		void to_json(nlohmann::json&j, const Astrometry & i);
		void from_json(const nlohmann::json& j, Astrometry & p);

		struct ContentRequest {
			ChildPtr<RawContent> fitsContent;
			ChildPtr<Histogram> histogram;
			ChildPtr<StarField> starField;
			ChildPtr<Astrometry> astrometry;

			std::string uniqKey();

			void produce(Entry * entry);

			void collectRawContents(std::list<RawContent *> & into);

			bool asJsonResult(Entry * e, nlohmann::json & j, const nlohmann::json & options) const;
		};

		void to_json(nlohmann::json&j, const ContentRequest & i);
		void from_json(const nlohmann::json& j, ContentRequest & p);

		// Wait until a stream frame gets obsoleted
		struct StreamWatchRequest {
			std::string stream;
			long serial;
			int timeout;
		};

		void to_json(nlohmann::json&j, const StreamWatchRequest & i);
		void from_json(const nlohmann::json& j, StreamWatchRequest & p);

		// Wait until a stream frame gets obsoleted
		struct StreamWatchResult {
			bool timedout;
			bool dead;
		};
		void to_json(nlohmann::json&j, const StreamWatchResult & i);
		void from_json(const nlohmann::json& j, StreamWatchResult & p);

		struct WorkRequest {
		};

		void to_json(nlohmann::json&j, const WorkRequest & i);
		void from_json(const nlohmann::json& j, WorkRequest & p);


		struct WorkResponse {
			ChildPtr<ContentRequest> content;
			std::string filename;
		};

		void to_json(nlohmann::json&j, const WorkResponse & i);
		void from_json(const nlohmann::json& j, WorkResponse & p);

		struct FinishedAnnounce {
			bool error;
			long size;
			std::string filename;
			std::string errorDetails;
		};

		void to_json(nlohmann::json&j, const FinishedAnnounce & i);
		void from_json(const nlohmann::json& j, FinishedAnnounce & p);

		struct ReleasedAnnounce {
			std::string filename;
		};

		void to_json(nlohmann::json&j, const ReleasedAnnounce & i);
		void from_json(const nlohmann::json& j, ReleasedAnnounce & p);

		struct StreamStartImageRequest {
			std::string streamId;
		};
		void to_json(nlohmann::json&j, const StreamStartImageRequest & i);
		void from_json(const nlohmann::json& j, StreamStartImageRequest & p);

		struct StreamStartImageResult {
			std::string filename;
			std::string streamId;
		};
		void to_json(nlohmann::json&j, const StreamStartImageResult & i);
		void from_json(const nlohmann::json& j, StreamStartImageResult & p);

		struct StreamPublishRequest {
			long size;
			std::string filename;
		};
		void to_json(nlohmann::json&j, const StreamPublishRequest & i);
		void from_json(const nlohmann::json& j, StreamPublishRequest & p);

		struct StreamPublishResult {
			long serial;
		};
		void to_json(nlohmann::json&j, const StreamPublishResult & i);
		void from_json(const nlohmann::json& j, StreamPublishResult & p);


		struct Request {
			ChildPtr<ContentRequest> contentRequest;
			ChildPtr<StreamWatchRequest> streamWatchRequest;
			ChildPtr<WorkRequest> workRequest;
			ChildPtr<FinishedAnnounce> finishedAnnounce;
			ChildPtr<ReleasedAnnounce> releasedAnnounce;
			ChildPtr<StreamStartImageRequest> streamStartImageRequest;
			ChildPtr<StreamPublishRequest> streamPublishRequest;
		};

		void to_json(nlohmann::json&j, const Request & i);
		void from_json(const nlohmann::json& j, Request & p);

		// Return a content key (a file).
		// if not ready, it is up to the caller to actually produce the content
		struct ContentResult {
			bool error;
			std::string filename;
			std::string errorDetails;
			ChildPtr<ContentRequest> actualRequest;
		};

		void to_json(nlohmann::json&j, const ContentResult & i);
		void from_json(const nlohmann::json& j, ContentResult & p);

		struct Result {
			ChildPtr<ContentResult> contentResult;
			ChildPtr<StreamWatchResult> streamWatchResult;
			ChildPtr<WorkResponse> todoResult;
			ChildPtr<StreamStartImageResult> streamStartImageResult;
			ChildPtr<StreamPublishResult> streamPublishResult;

		};

		void to_json(nlohmann::json&j, const Result & i);
		void from_json(const nlohmann::json& j, Result & p);

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
		std::string filename;
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

		// Wait a message and returns its size
		int clientWaitMessage(char * buffer);
		void clientSendMessage(const void * data, int length);
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
