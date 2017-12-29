#include "SharedCache.h"

namespace SharedCache {
	namespace Messages {

		void to_json(nlohmann::json&j, const FitsContent & i)
		{
			j = nlohmann::json();
			j["path"] = i.path;
		}

		void from_json(const nlohmann::json& j, FitsContent & p) {
			p.path = j.at("path").get<std::string>();
		}

		void to_json(nlohmann::json&j, const ContentRequest & i)
		{
			j = nlohmann::json();
			if (i.fitsContent) {
				j["fitsContent"] = *i.fitsContent;
			}
		}

		void from_json(const nlohmann::json& j, ContentRequest & p) {
			if (j.find("fitsContent") != j.end()) {
				p.fitsContent = new FitsContent(j.at("fitsContent").get<FitsContent>());
			}
		}


		void to_json(nlohmann::json&j, const FinishedAnnounce & i)
		{
			j = nlohmann::json();
			j["size"] = i.size;
			j["path"] = i.path;
		}

		void from_json(const nlohmann::json& j, FinishedAnnounce & p) {
			p.size = j.at("size").get<long>();
			p.path = j.at("path").get<std::string>();
		}


		void to_json(nlohmann::json&j, const ReleasedAnnounce & i)
		{
			j = nlohmann::json();
			j["path"] = i.path;
		}

		void from_json(const nlohmann::json& j, ReleasedAnnounce & p) {
			p.path = j.at("path").get<std::string>();
		}


		void to_json(nlohmann::json&j, const Request & i)
		{
			j = nlohmann::json();
			if (i.contentRequest) j["contentRequest"] = *i.contentRequest;
			if (i.finishedAnnounce) j["finishedAnnounce"] = *i.finishedAnnounce;
			if (i.releasedAnnounce) j["releasedAnnounce"] = *i.releasedAnnounce;
		}

		void from_json(const nlohmann::json& j, Request & p) {
			if (j.find("contentRequest") != j.end()) {
				p.contentRequest = new ContentRequest(j.at("contentRequest").get<ContentRequest>());
			} else {
				p.contentRequest = nullptr;
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
			j = nlohmann::json();
			j["path"] = i.path;
			j["ready"] = i.ready;
		}
		void from_json(const nlohmann::json& j, ContentResult & p)
		{
			p.path = j.at("path").get<std::string>();
			p.ready = j.at("ready").get<bool>();
		}

		void to_json(nlohmann::json&j, const Result & i)
		{
			j = nlohmann::json();
			if (i.contentResult) j["contentResult"] = *i.contentResult;
		}
		void from_json(const nlohmann::json& j, Result & p)
		{
			if (j.find("contentResult") != j.end()) {
				p.contentResult = new ContentResult(j.at("contentResult").get<ContentResult>());
			} else {
				p.contentResult = nullptr;
			}
		}

	}
}
