#include "SharedCache.h"

namespace SharedCache {
	namespace Messages {

		void to_json(nlohmann::json&j, const RawContent & i)
		{
			j = nlohmann::json::object();
			j["path"] = i.path;
		}

		void from_json(const nlohmann::json& j, RawContent & p) {
			p.path = j.at("path").get<std::string>();
		}

		void to_json(nlohmann::json&j, const Histogram & i)
		{
			j = nlohmann::json::object();
			j["source"] = i.source;
		}

		void from_json(const nlohmann::json& j, Histogram & p) {
			p.source = j.at("source").get<RawContent>();
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
		}

		void from_json(const nlohmann::json& j, ContentRequest & p) {
			if (j.find("fitsContent") != j.end()) {
				p.fitsContent = new RawContent(j.at("fitsContent").get<RawContent>());
			}
			if (j.find("histogram") != j.end()) {
				p.histogram = new Histogram(j.at("histogram").get<Histogram>());
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
		}

	}
}
