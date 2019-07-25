#include "SharedCache.h"

namespace SharedCache {
	namespace Messages {
		Writable::Writable() {
		}
		Writable::~Writable() {
		}

		void Writable::collectMemfd(std::vector<int*> & content)
		{}

		void to_json(nlohmann::json&j, const Writable & i) {
			i.to_json(j);
		}

		void from_json(const nlohmann::json& j, Writable & p) {
			p.from_json(j);
		}

		void RawContent::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			if (!this->path.empty()) {
				j["path"] = this->path;
			}
			if (!this->stream.empty()) {
				j["stream"] = this->stream;
			}
			if (this->serial != 0) {
				j["serial"] = this->serial;
			}
			if (this->exactSerial) {
				j["exactSerial"] = this->exactSerial;
			}
		}

		void RawContent::from_json(const nlohmann::json& j) {
			if (j.find("path") != j.end()) {
				this->path = j.at("path").get<std::string>();
			}
			if (j.find("stream") != j.end()) {
				this->stream = j.at("stream").get<std::string>();
			}
			if (j.find("serial") != j.end()) {
				this->serial = j.at("serial").get<long>();
			} else {
				this->serial = 0;
			}

			if (j.find("exactSerial") != j.end()) {
				this->exactSerial = j.at("exactSerial").get<bool>();
			} else {
				this->exactSerial = false;
			}
		}

		void Histogram::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["source"] = this->source;
		}

		void Histogram::from_json(const nlohmann::json& j) {
			this->source = j.at("source").get<RawContent>();
		}

		void StarField::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["source"] = this->source;
		}

		void StarField::from_json(const nlohmann::json& j) {
			this->source = j.at("source").get<RawContent>();
		}

		void StarOccurence::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["x"] = this->x;
			j["y"] = this->y;
			j["fwhm"] = this->fwhm;
			j["stddev"] = this->stddev;
			j["maxFwhm"] = this->maxFwhm;
			j["maxStddev"] = this->maxStddev;
			j["maxFwhmAngle"] = this->maxFwhmAngle;
			j["minFwhm"] = this->minFwhm;
			j["minStddev"] = this->minStddev;
			j["minFwhmAngle"] = this->minFwhmAngle;
			j["flux"] = this->flux;
		}

		void StarOccurence::from_json(const nlohmann::json&j)
		{
			this->x = j.at("x").get<double>();
			this->y = j.at("y").get<double>();
			this->fwhm = j.at("fwhm").get<double>();
			this->stddev = j.at("stddev").get<double>();
			this->maxFwhm = j.at("maxFwhm").get<double>();
			this->maxStddev = j.at("maxStddev").get<double>();
			this->maxFwhmAngle= j.at("maxFwhmAngle").get<double>();
			this->minFwhm = j.at("minFwhm").get<double>();
			this->minStddev = j.at("minStddev").get<double>();
			this->minFwhmAngle = j.at("minFwhmAngle").get<double>();
			this->flux = j.at("flux").get<double>();
		}

		void StarFieldResult::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["width"] = this->width;
			j["height"] = this->height;
			j["stars"] = this->stars;
		}

		void StarFieldResult::from_json(const nlohmann::json& j)
		{
			this->width = j.at("width").get<double>();
			this->height = j.at("height").get<double>();
			this->stars = j.at("stars").get<std::vector<StarOccurence>>();
		}

		void Astrometry::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["source"] = this->source;
			j["exePath"] = this->exePath;
			j["libraryPath"] = this->libraryPath;
			j["fieldMin"] = this->fieldMin;
			j["fieldMax"] = this->fieldMax;
			j["raCenterEstimate"] = this->raCenterEstimate;
			j["decCenterEstimate"] = this->decCenterEstimate;
			j["searchRadius"] = this->searchRadius;
			j["numberOfBinInUniformize"] = this->numberOfBinInUniformize;
		}

		void Astrometry::from_json(const nlohmann::json& j) {
			this->source = j.at("source").get<StarField>();
			this->exePath = j.at("exePath").get<std::string>();
			this->libraryPath = j.at("libraryPath").get<std::string>();
			this->fieldMin = j.at("fieldMin").get<double>();
			this->fieldMax = j.at("fieldMax").get<double>();
			this->raCenterEstimate = j.at("raCenterEstimate").get<double>();
			this->decCenterEstimate = j.at("decCenterEstimate").get<double>();
			this->searchRadius = j.at("searchRadius").get<double>();
			this->numberOfBinInUniformize = j.at("numberOfBinInUniformize").get<int>();
		}

		void JsonQuery::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			if (this->starField) {
				j["starField"] = *this->starField;
			}
			if (this->astrometry) {
				j["astrometry"] = *this->astrometry;
			}
		}

		void JsonQuery::from_json(const nlohmann::json& j) {
			if (j.find("starField") != j.end()) {
				this->starField = new StarField(j.at("starField").get<StarField>());
			}
			if (j.find("astrometry") != j.end()) {
				this->astrometry = new Astrometry(j.at("astrometry").get<Astrometry>());
			}
		}

		void ContentRequest::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			if (this->fitsContent) {
				j["fitsContent"] = *this->fitsContent;
			}
			if (this->histogram) {
				j["histogram"] = *this->histogram;
			}
			if (this->jsonQuery) {
				j["jsonQuery"] = *this->jsonQuery;
			}
		}

		void ContentRequest::from_json(const nlohmann::json& j) {
			if (j.find("fitsContent") != j.end()) {
				this->fitsContent = new RawContent(j.at("fitsContent").get<RawContent>());
			}
			if (j.find("histogram") != j.end()) {
				this->histogram = new Histogram(j.at("histogram").get<Histogram>());
			}
			if (j.find("jsonQuery") != j.end()) {
				this->jsonQuery = new JsonQuery(j.at("jsonQuery").get<JsonQuery>());
			}
		}

		void StreamWatchRequest::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["stream"] = this->stream;
			j["serial"] = this->serial;
			if (this->timeout) {
				j["timeout"] = this->timeout;
			}
		}

		void StreamWatchRequest::from_json(const nlohmann::json& j) {
			this->stream = j.at("stream").get<std::string>();
			this->serial = j.at("serial").get<long>();
			if (j.find("timeout") != j.end()) {
				this->timeout = j.at("timeout").get<int>();
			} else {
				this->timeout = 0;
			}
		}

		void StreamWatchResult::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["timedout"] = this->timedout;
			j["dead"] = this->dead;
		}

		void StreamWatchResult::from_json(const nlohmann::json& j) {
			if (j.find("timedout") != j.end()) {
				this->timedout = j.at("timedout").get<bool>();
			} else {
				this->timedout = false;
			}
			if (j.find("dead") != j.end()) {
				this->dead = j.at("dead").get<bool>();
			} else {
				this->dead = false;
			}
		}

		void WorkRequest::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j.object();
		}

		void WorkRequest::from_json(const nlohmann::json& j) {
		}
		void WorkResponse::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			if (this->content) {
				j["content"] = *this->content;
			}
			j["uuid"] = this->uuid;
		}

		void WorkResponse::from_json(const nlohmann::json& j) {
			if (j.find("content") != j.end()) {
				this->content = new ContentRequest(j.at("content").get<ContentRequest>());
			}
			this->uuid = j["uuid"].get<std::string>();
		}


		void FinishedAnnounce::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["size"] = this->size;
			j["error"] = this->error;
			j["uuid"] = this->uuid;
			j["memfd"] = this->memfd;
			j["errorDetails"] = this->errorDetails;
		}

		void FinishedAnnounce::from_json(const nlohmann::json& j) {
			this->error = j.at("error").get<bool>();
			this->size = j.at("size").get<long>();
			this->uuid = j.at("uuid").get<std::string>();
			this->memfd = j.at("memfd").get<int>();
			this->errorDetails = j.at("errorDetails").get<std::string>();
		}

		void FinishedAnnounce::collectMemfd(std::vector<int*> & content)
		{
			content.push_back(&this->memfd);
		}

		void ReleasedAnnounce::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["uuid"] = this->uuid;
		}

		void ReleasedAnnounce::from_json(const nlohmann::json& j) {
			this->uuid = j.at("uuid").get<std::string>();
		}


		void Request::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			if (this->contentRequest) j["contentRequest"] = *this->contentRequest;
			if (this->streamWatchRequest) j["streamWatchRequest"] = *this->streamWatchRequest;
			if (this->workRequest) j["workRequest"] = *this->workRequest;
			if (this->finishedAnnounce) j["finishedAnnounce"] = *this->finishedAnnounce;
			if (this->releasedAnnounce) j["releasedAnnounce"] = *this->releasedAnnounce;
			if (this->streamPublishRequest) j["streamPublishRequest"] = *this->streamPublishRequest;
			if (this->streamStartImageRequest) j["streamStartImageRequest"] = *this->streamStartImageRequest;
		}

		void Request::from_json(const nlohmann::json& j) {
			if (j.find("contentRequest") != j.end()) {
				this->contentRequest = new ContentRequest(j.at("contentRequest").get<ContentRequest>());
			} else {
				this->contentRequest = nullptr;
			}
			if (j.find("streamWatchRequest") != j.end()) {
				this->streamWatchRequest = new StreamWatchRequest(j.at("streamWatchRequest").get<StreamWatchRequest>());
			} else {
				this->streamWatchRequest = nullptr;
			}
			if (j.find("workRequest") != j.end()) {
				this->workRequest = new WorkRequest(j.at("workRequest").get<WorkRequest>());
			} else {
				this->workRequest = nullptr;
			}
			if (j.find("finishedAnnounce") != j.end()) {
				this->finishedAnnounce = new FinishedAnnounce(j.at("finishedAnnounce").get<FinishedAnnounce>());
			} else {
				this->finishedAnnounce = nullptr;
			}
			if (j.find("releasedAnnounce") != j.end()) {
				this->releasedAnnounce = new ReleasedAnnounce(j.at("releasedAnnounce").get<ReleasedAnnounce>());
			} else {
				this->releasedAnnounce = nullptr;
			}
			if (j.find("streamPublishRequest") != j.end()) {
				this->streamPublishRequest = new StreamPublishRequest(j.at("streamPublishRequest").get<StreamPublishRequest>());
			} else {
				this->streamPublishRequest = nullptr;
			}
			if (j.find("streamStartImageRequest") != j.end()) {
				this->streamStartImageRequest = new StreamStartImageRequest(j.at("streamStartImageRequest").get<StreamStartImageRequest>());
			} else {
				this->streamStartImageRequest = nullptr;
			}
		}

		void Request::collectMemfd(std::vector<int*> & content)
		{
			if (this->contentRequest) {
				this->contentRequest->collectMemfd(content);
			}
			if (this->streamWatchRequest) {
				this->streamWatchRequest->collectMemfd(content);
			}
			if (this->workRequest) {
				this->workRequest->collectMemfd(content);
			}
			if (this->finishedAnnounce) {
				this->finishedAnnounce->collectMemfd(content);
			}
			if (this->releasedAnnounce) {
				this->releasedAnnounce->collectMemfd(content);
			}
			if (this->streamPublishRequest) {
				this->streamPublishRequest->collectMemfd(content);
			}
			if (this->streamStartImageRequest) {
				this->streamStartImageRequest->collectMemfd(content);
			}
		}


		void ContentResult::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["uuid"] = this->uuid;
			j["memfd"] = this->memfd;
			j["errorDetails"] = this->errorDetails;
			j["error"] = this->error;
			if (this->actualRequest) j["actualRequest"] = *this->actualRequest;
		}
		void ContentResult::from_json(const nlohmann::json& j)
		{
			this->uuid = j.at("uuid").get<std::string>();
			this->memfd = j.at("memfd").get<int>();
			this->errorDetails = j.at("errorDetails").get<std::string>();
			this->error = j.at("error").get<bool>();
			if (j.find("actualRequest") != j.end()) {
				this->actualRequest = new ContentRequest(j.at("actualRequest").get<ContentRequest>());
			} else {
				this->actualRequest = nullptr;
			}
		}

		void ContentResult::collectMemfd(std::vector<int*> & content)
		{
			content.push_back(&this->memfd);
		}

		void Result::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			if (this->contentResult) j["contentResult"] = *this->contentResult;
			if (this->streamWatchResult) j["streamWatchResult"] = *this->streamWatchResult;
			if (this->todoResult) j["todoResult"] = *this->todoResult;
			if (this->streamPublishResult) j["streamPublishResult"] = *this->streamPublishResult;
			if (this->streamStartImageResult) j["streamStartImageResult"] = *this->streamStartImageResult;
		}

		void Result::from_json(const nlohmann::json& j)
		{
			if (j.find("contentResult") != j.end()) {
				this->contentResult = new ContentResult(j.at("contentResult").get<ContentResult>());
			} else {
				this->contentResult = nullptr;
			}
			if (j.find("streamWatchResult") != j.end()) {
				this->streamWatchResult = new StreamWatchResult(j.at("streamWatchResult").get<StreamWatchResult>());
			} else {
				this->streamWatchResult = nullptr;
			}
			if (j.find("todoResult") != j.end()) {
				this->todoResult = new WorkResponse(j.at("todoResult").get<WorkResponse>());
			} else {
				this->todoResult = nullptr;
			}
			if (j.find("streamPublishResult") != j.end()) {
				this->streamPublishResult = new StreamPublishResult(j.at("streamPublishResult").get<StreamPublishResult>());
			} else {
				this->streamPublishResult = nullptr;
			}
			if (j.find("streamStartImageResult") != j.end()) {
				this->streamStartImageResult = new StreamStartImageResult(j.at("streamStartImageResult").get<StreamStartImageResult>());
			} else {
				this->streamStartImageResult = nullptr;
			}
		}


		void Result::collectMemfd(std::vector<int*> & content)
		{
			if (this->contentResult) {
				this->contentResult->collectMemfd(content);
			}

			if (this->streamWatchResult) {
				this->streamWatchResult->collectMemfd(content);
			}

			if (this->todoResult) {
				this->todoResult->collectMemfd(content);
			}

			if (this->streamPublishResult) {
				this->streamPublishResult->collectMemfd(content);
			}

			if (this->streamStartImageResult) {
				this->streamStartImageResult->collectMemfd(content);
			}

		}


		void StreamStartImageRequest::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
		}

		void StreamStartImageRequest::from_json(const nlohmann::json& j)
		{}

		void StreamStartImageResult::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["uuid"] = this->uuid;
			j["streamId"] = this->streamId;
		}

		void StreamStartImageResult::from_json(const nlohmann::json& j)
		{
			this->uuid = j.at("uuid").get<std::string>();
			this->streamId = j.at("streamId").get<std::string>();
		}

		void StreamPublishRequest::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["size"] = this->size;
			j["uuid"] = this->uuid;
			j["memfd"] = this->memfd;
		}

		void StreamPublishRequest::from_json(const nlohmann::json& j)
		{
			this->size = j.at("size").get<long>();
			this->uuid = j.at("uuid").get<std::string>();
			this->memfd = j.at("memfd").get<int>();
		}

		void StreamPublishRequest::collectMemfd(std::vector<int*> & content)
		{
			content.push_back(&this->memfd);
		}

		void StreamPublishResult::to_json(nlohmann::json&j) const
		{
			j = nlohmann::json::object();
			j["serial"] = this->serial;
		}

		void StreamPublishResult::from_json(const nlohmann::json& j)
		{
			this->serial = j.at("serial").get<long>();
		}
	}
}
