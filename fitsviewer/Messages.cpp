#include "SharedCache.h"

namespace SharedCache {
	namespace Messages {

		void to_json(nlohmann::json&j, const RawContent & i)
		{
			j = nlohmann::json::object();
			if (!i.path.empty()) {
				j["path"] = i.path;
			}
			if (!i.stream.empty()) {
				j["stream"] = i.stream;
			}
			if (i.serial != 0) {
				j["serial"] = i.serial;
			}
			if (i.exactSerial) {
				j["exactSerial"] = i.exactSerial;
			}
		}

		void from_json(const nlohmann::json& j, RawContent & p) {
			if (j.find("path") != j.end()) {
				p.path = j.at("path").get<std::string>();
			}
			if (j.find("stream") != j.end()) {
				p.stream = j.at("stream").get<std::string>();
			}
			if (j.find("serial") != j.end()) {
				p.serial = j.at("serial").get<long>();
			} else {
				p.serial = 0;
			}

			if (j.find("exactSerial") != j.end()) {
				p.exactSerial = j.at("exactSerial").get<bool>();
			} else {
				p.exactSerial = false;
			}
		}

		void to_json(nlohmann::json&j, const Histogram & i)
		{
			j = nlohmann::json::object();
			j["source"] = i.source;
		}

		void from_json(const nlohmann::json& j, Histogram & p) {
			p.source = j.at("source").get<RawContent>();
		}

		void to_json(nlohmann::json&j, const StarField & i)
		{
			j = nlohmann::json::object();
			j["source"] = i.source;
		}

		void from_json(const nlohmann::json& j, StarField & p) {
			p.source = j.at("source").get<RawContent>();
		}

		void to_json(nlohmann::json&j, const StarOccurence & i)
		{
			j = nlohmann::json::object();
			j["x"] = i.x;
			j["y"] = i.y;
			j["fwhm"] = i.fwhm;
			j["stddev"] = i.stddev;
			j["maxFwhm"] = i.maxFwhm;
			j["maxStddev"] = i.maxStddev;
			j["maxFwhmAngle"] = i.maxFwhmAngle;
			j["minFwhm"] = i.minFwhm;
			j["minStddev"] = i.minStddev;
			j["minFwhmAngle"] = i.minFwhmAngle;
			j["flux"] = i.flux;
		}

		void from_json(const nlohmann::json&j, StarOccurence & i)
		{
			i.x = j.at("x").get<double>();
			i.y = j.at("y").get<double>();
			i.fwhm = j.at("fwhm").get<double>();
			i.stddev = j.at("stddev").get<double>();
			i.maxFwhm = j.at("maxFwhm").get<double>();
			i.maxStddev = j.at("maxStddev").get<double>();
			i.maxFwhmAngle= j.at("maxFwhmAngle").get<double>();
			i.minFwhm = j.at("minFwhm").get<double>();
			i.minStddev = j.at("minStddev").get<double>();
			i.minFwhmAngle = j.at("minFwhmAngle").get<double>();
			i.flux = j.at("flux").get<double>();
		}

		void to_json(nlohmann::json&j, const StarFieldResult & i)
		{
			j = nlohmann::json::object();
			j["width"] = i.width;
			j["height"] = i.height;
			j["stars"] = i.stars;
		}

		void from_json(const nlohmann::json& j, StarFieldResult & p)
		{
			p.width = j.at("width").get<double>();
			p.height = j.at("height").get<double>();
			p.stars = j.at("stars").get<std::vector<StarOccurence>>();
		}

		void to_json(nlohmann::json&j, const Astrometry & i)
		{
			j = nlohmann::json::object();
			j["source"] = i.source;
			j["exePath"] = i.exePath;
			j["libraryPath"] = i.libraryPath;
			j["fieldMin"] = i.fieldMin;
			j["fieldMax"] = i.fieldMax;
			j["raCenterEstimate"] = i.raCenterEstimate;
			j["decCenterEstimate"] = i.decCenterEstimate;
			j["searchRadius"] = i.searchRadius;
			j["numberOfBinInUniformize"] = i.numberOfBinInUniformize;
		}

		void from_json(const nlohmann::json& j, Astrometry & p) {
			p.source = j.at("source").get<StarField>();
			p.exePath = j.at("exePath").get<std::string>();
			p.libraryPath = j.at("libraryPath").get<std::string>();
			p.fieldMin = j.at("fieldMin").get<double>();
			p.fieldMax = j.at("fieldMax").get<double>();
			p.raCenterEstimate = j.at("raCenterEstimate").get<double>();
			p.decCenterEstimate = j.at("decCenterEstimate").get<double>();
			p.searchRadius = j.at("searchRadius").get<double>();
			p.numberOfBinInUniformize = j.at("numberOfBinInUniformize").get<int>();
		}

		void to_json(nlohmann::json&j, const JsonQuery & i)
		{
			j = nlohmann::json::object();
			if (i.starField) {
				j["starField"] = *i.starField;
			}
			if (i.astrometry) {
				j["astrometry"] = *i.astrometry;
			}
		}

		void from_json(const nlohmann::json& j, JsonQuery & p) {
			if (j.find("starField") != j.end()) {
				p.starField = new StarField(j.at("starField").get<StarField>());
			}
			if (j.find("astrometry") != j.end()) {
				p.astrometry = new Astrometry(j.at("astrometry").get<Astrometry>());
			}
		}

		void to_json(nlohmann::json&j, const ContentRequest & i)
		{
			j = nlohmann::json::object();
			if (i.fitsContent) {
				j["fitsContent"] = *i.fitsContent;
			}
			if (i.histogram) {
				j["histogram"] = *i.histogram;
			}
			if (i.jsonQuery) {
				j["jsonQuery"] = *i.jsonQuery;
			}
		}

		void from_json(const nlohmann::json& j, ContentRequest & p) {
			if (j.find("fitsContent") != j.end()) {
				p.fitsContent = new RawContent(j.at("fitsContent").get<RawContent>());
			}
			if (j.find("histogram") != j.end()) {
				p.histogram = new Histogram(j.at("histogram").get<Histogram>());
			}
			if (j.find("jsonQuery") != j.end()) {
				p.jsonQuery = new JsonQuery(j.at("jsonQuery").get<JsonQuery>());
			}
		}

		void to_json(nlohmann::json&j, const WorkRequest & i)
		{
			j = nlohmann::json::object();
			j.object();
		}

		void from_json(const nlohmann::json& j, WorkRequest & p) {
		}
		void to_json(nlohmann::json&j, const WorkResponse & i)
		{
			j = nlohmann::json::object();
			if (i.content) {
				j["content"] = *i.content;
			}
			j["filename"] = i.filename;
		}

		void from_json(const nlohmann::json& j, WorkResponse & p) {
			if (j.find("content") != j.end()) {
				p.content = new ContentRequest(j.at("content").get<ContentRequest>());
			}
			p.filename = j["filename"].get<std::string>();
		}


		void to_json(nlohmann::json&j, const FinishedAnnounce & i)
		{
			j = nlohmann::json::object();
			j["size"] = i.size;
			j["error"] = i.error;
			j["filename"] = i.filename;
			j["errorDetails"] = i.errorDetails;
		}

		void from_json(const nlohmann::json& j, FinishedAnnounce & p) {
			p.error = j.at("error").get<bool>();
			p.size = j.at("size").get<long>();
			p.filename = j.at("filename").get<std::string>();
			p.errorDetails = j.at("errorDetails").get<std::string>();
		}


		void to_json(nlohmann::json&j, const ReleasedAnnounce & i)
		{
			j = nlohmann::json::object();
			j["filename"] = i.filename;
		}

		void from_json(const nlohmann::json& j, ReleasedAnnounce & p) {
			p.filename = j.at("filename").get<std::string>();
		}


		void to_json(nlohmann::json&j, const Request & i)
		{
			j = nlohmann::json::object();
			if (i.contentRequest) j["contentRequest"] = *i.contentRequest;
			if (i.workRequest) j["workRequest"] = *i.workRequest;
			if (i.finishedAnnounce) j["finishedAnnounce"] = *i.finishedAnnounce;
			if (i.releasedAnnounce) j["releasedAnnounce"] = *i.releasedAnnounce;
			if (i.streamPublishRequest) j["streamPublishRequest"] = *i.streamPublishRequest;
			if (i.streamStartImageRequest) j["streamStartImageRequest"] = *i.streamStartImageRequest;
		}

		void from_json(const nlohmann::json& j, Request & p) {
			if (j.find("contentRequest") != j.end()) {
				p.contentRequest = new ContentRequest(j.at("contentRequest").get<ContentRequest>());
			} else {
				p.contentRequest = nullptr;
			}
			if (j.find("workRequest") != j.end()) {
				p.workRequest = new WorkRequest(j.at("workRequest").get<WorkRequest>());
			} else {
				p.workRequest = nullptr;
			}
			if (j.find("finishedAnnounce") != j.end()) {
				p.finishedAnnounce = new FinishedAnnounce(j.at("finishedAnnounce").get<FinishedAnnounce>());
			} else {
				p.finishedAnnounce = nullptr;
			}
			if (j.find("releasedAnnounce") != j.end()) {
				p.releasedAnnounce = new ReleasedAnnounce(j.at("releasedAnnounce").get<ReleasedAnnounce>());
			} else {
				p.releasedAnnounce = nullptr;
			}
			if (j.find("streamPublishRequest") != j.end()) {
				p.streamPublishRequest = new StreamPublishRequest(j.at("streamPublishRequest").get<StreamPublishRequest>());
			} else {
				p.streamPublishRequest = nullptr;
			}
			if (j.find("streamStartImageRequest") != j.end()) {
				p.streamStartImageRequest = new StreamStartImageRequest(j.at("streamStartImageRequest").get<StreamStartImageRequest>());
			} else {
				p.streamStartImageRequest = nullptr;
			}
		}


		void to_json(nlohmann::json&j, const ContentResult & i)
		{
			j = nlohmann::json::object();
			j["filename"] = i.filename;
			j["errorDetails"] = i.errorDetails;
			j["error"] = i.error;
		}
		void from_json(const nlohmann::json& j, ContentResult & p)
		{
			p.filename = j.at("filename").get<std::string>();
			p.errorDetails = j.at("errorDetails").get<std::string>();
			p.error = j.at("error").get<bool>();
		}

		void to_json(nlohmann::json&j, const Result & i)
		{
			j = nlohmann::json::object();
			if (i.contentResult) j["contentResult"] = *i.contentResult;
			if (i.todoResult) j["todoResult"] = *i.todoResult;
			if (i.streamPublishResult) j["streamPublishResult"] = *i.streamPublishResult;
			if (i.streamStartImageResult) j["streamStartImageResult"] = *i.streamStartImageResult;
		}
		void from_json(const nlohmann::json& j, Result & p)
		{
			if (j.find("contentResult") != j.end()) {
				p.contentResult = new ContentResult(j.at("contentResult").get<ContentResult>());
			} else {
				p.contentResult = nullptr;
			}
			if (j.find("todoResult") != j.end()) {
				p.todoResult = new WorkResponse(j.at("todoResult").get<WorkResponse>());
			} else {
				p.todoResult = nullptr;
			}
			if (j.find("streamPublishResult") != j.end()) {
				p.streamPublishResult = new StreamPublishResult(j.at("streamPublishResult").get<StreamPublishResult>());
			} else {
				p.streamPublishResult = nullptr;
			}
			if (j.find("streamStartImageResult") != j.end()) {
				p.streamStartImageResult = new StreamStartImageResult(j.at("streamStartImageResult").get<StreamStartImageResult>());
			} else {
				p.streamStartImageResult = nullptr;
			}
		}


		void to_json(nlohmann::json&j, const StreamStartImageRequest & i)
		{
			j = nlohmann::json::object();
		}

		void from_json(const nlohmann::json& j, StreamStartImageRequest & p)
		{}

		void to_json(nlohmann::json&j, const StreamStartImageResult & i)
		{
			j = nlohmann::json::object();
			j["filename"] = i.filename;
			j["streamId"] = i.streamId;
		}

		void from_json(const nlohmann::json& j, StreamStartImageResult & p)
		{
			p.filename = j.at("filename").get<std::string>();
			p.streamId = j.at("streamId").get<std::string>();
		}

		void to_json(nlohmann::json&j, const StreamPublishRequest & i)
		{
			j = nlohmann::json::object();
			j["size"] = i.size;
			j["filename"] = i.filename;
		}

		void from_json(const nlohmann::json& j, StreamPublishRequest & p)
		{
			p.size = j.at("size").get<long>();
			p.filename = j.at("filename").get<std::string>();
		}

		void to_json(nlohmann::json&j, const StreamPublishResult & i)
		{
			j = nlohmann::json::object();
			j["serial"] = i.serial;
		}

		void from_json(const nlohmann::json& j, StreamPublishResult & p)
		{
			p.serial = j.at("serial").get<long>();
		}
	}
}
