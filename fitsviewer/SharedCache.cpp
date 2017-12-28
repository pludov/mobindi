#include <sys/types.h>
#include <sys/stat.h>
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

#include <iostream>
#include "SharedCache.h"

#define MAX_MESSAGE_SIZE 32768

namespace SharedCache {
	class CacheFileDesc {
		long size;
		long prodDuration;
		long lastUse;

		bool produced;
		long clientCount;
		std::string path;
	};

	class Client {
		friend class Cache;

		int fd;

		char * readBuffer;
		int readBufferPos;

		char * writeBuffer;
		int writeBufferPos;
		int writeBufferLeft;

		pollfd * poll;

		Client(int fd) :readBuffer(), writeBuffer() {
			this->fd = fd;
			poll = nullptr;
			writeBufferPos = 0;
			writeBufferLeft = 0;
			readBufferPos = 0;
			readBuffer = (char*)malloc(MAX_MESSAGE_SIZE);
			writeBuffer = (char*)malloc(MAX_MESSAGE_SIZE);
		}
		~Client()
		{
			if (this->fd != -1) {
				close(this->fd);
				this->fd = -1;
			}
			free(readBuffer);
			free(writeBuffer);
		}

		void kill()
		{
			close(this->fd);
			this->fd = -1;
		}

		void send(const std::string & str)
		{
			if (this->fd == -1) return;
			unsigned long l = str.length();
			if (l > MAX_MESSAGE_SIZE - 2) {
				kill();
			} else {

				*((uint16_t*)writeBuffer) = l;
				memcpy(writeBuffer + 2, str.c_str(), l);
				writeBufferPos = 0;
				writeBufferLeft = 2 + l;
			}

		}
	};

	Cache::Cache(const std::string & path, long maxSize) :
				basePath(path)
	{
		this->maxSize = maxSize;
		init();
	}

	namespace Messages {
		struct Query {
			int type;
			nlohmann::json details;
		};

		struct ResourceLoc {
			std::string path;
			bool ready;
		};

		void to_json(nlohmann::json& j, const Query & q)
		{
			j = nlohmann::json();
			j["type"] = q.type;
			j["details"] = q.details;
		}

		void from_json(nlohmann::json& j, Query & q)
		{
			q.type = j.at("type").get<int>();
			q.details = j.at("details");
		}
	}

	Entry * Cache::getEntry(const nlohmann::json & jsonDesc)
	{
		Messages::Query msg;
		msg.type = 0;
		msg.details = jsonDesc;
		std::string str;
		{
			nlohmann::json j = msg;
			str = j.dump();
		}
//		std::cerr << "Sending " << str << "\n";
		clientSendMessage(str.data(), str.length());
		char buffer[MAX_MESSAGE_SIZE];
		int sze = clientWaitMessage(buffer);
		str = std::string(buffer, sze);



//		std::cerr<<"Received " << str << "\n";
		return 0;
	}

	void Cache::connectExisting()
	{
		clientFd = socket(AF_UNIX, SOCK_STREAM, 0);
		if (clientFd == -1) {
			perror("socket");
			throw std::runtime_error("socket");
		}
		struct sockaddr_un addr;
		setSockAddr(addr);

		if (connect(clientFd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
			perror("connect");
			throw std::runtime_error("connect");
		}


//		char message[256];
//		const char * payload = "coucou !\n";
//		*((uint16_t*)message) = strlen(payload) + 2;
//		strcpy(message + 2, payload);
//		write(clientFd, message, strlen(payload) + 2);
//
//		char receive[MAX_MESSAGE_SIZE];
//		int receiveSize = clientWaitMessage(receive);
//		receive[receiveSize] = 0;
//		printf("received back: %s\n", receive);
	}

	void Cache::clientSendMessage(const void * data, int length)
	{
		if (length > MAX_MESSAGE_SIZE - 2) {
			throw std::runtime_error("Message too big");
		}
		uint16_t size = length + 2;
		int wr = write(clientFd, &size, 2);
		if (wr == -1) {
			perror("write");
			throw std::runtime_error("write");
		}
		if (wr < 2) {
			throw std::runtime_error("short write");
		}

		wr = write(clientFd, data, length);
		if (wr == -1) {
			perror("write");
			throw std::runtime_error("write");
		}
		if (wr < length) {
			throw std::runtime_error("short write");
		}
	}

	int Cache::clientWaitMessage(char * buffer)
	{
		uint16_t size;
		int readen = read(clientFd, &size, 2);
		if (readen == -1) {
			perror("read");
			throw std::runtime_error("read");
		}
		if (readen < 2) {
			throw std::runtime_error("short read");
		}
		if (size > MAX_MESSAGE_SIZE) {
			throw std::runtime_error("invalid size");
		}
		readen = read(clientFd, buffer, size);
		if (readen == -1) {
			perror("read");
			throw std::runtime_error("read");
		}
		if (readen < size) {
			throw std::runtime_error("short read");
		}
		return size;
	}

	void Cache::setSockAddr(struct sockaddr_un & addr)
	{
		memset(&addr, 0, sizeof(addr));
		addr.sun_family = AF_UNIX;
		strncpy(addr.sun_path + 1, basePath.c_str(), sizeof(addr.sun_path)-2);
	}

	void Cache::init()
	{
		int rslt = mkdir(basePath.c_str(), 0777);
		if (rslt == -1 && errno != EEXIST) {
			perror(basePath.c_str());
			throw std::runtime_error("Unable to create cache directory");
		}

		serverFd = socket(AF_UNIX, SOCK_STREAM, 0);
		if (serverFd < 0) {
			perror("socket");
			throw std::runtime_error("Unable to create socket");
		}
		int on = 1;
		if (ioctl(serverFd, FIONBIO, (char *)&on) == -1)
		{
			perror("ioctl");
			throw std::runtime_error("Unable to setup socket");
		}
		struct sockaddr_un addr;
		setSockAddr(addr);
		rslt = bind(serverFd, (struct sockaddr*)&addr, sizeof(addr));
		if (rslt == -1) {
			if (errno == EADDRINUSE) {
				connectExisting();
				return;
			}
			perror(basePath.c_str());
			throw std::runtime_error("Unable to bind socket");
		}
		if (listen(serverFd, 32) == -1) {
			perror("listen");
			close(serverFd);
			throw std::runtime_error("Unable to listen");
		}
		signal(SIGCHLD, SIG_IGN); //stops the parent waiting for the child process to end
		pid_t p = fork();
		if (p == -1) {
			perror("fork");
			close(serverFd);
			throw std::runtime_error("Unable to fork");
		}
		if (p == 0) {
			std::cerr << "Server started\n";
			chdir("/");
			signal (SIGHUP, SIG_IGN);
			/*setsid();
			close(0);
			close(1);
			close(2);*/

			try {
				server();
			} catch(...) {
				//_exit(0);
				throw;
			}
			//_exit(0);
		}
		close(serverFd);
		connectExisting();
	}

	void handleErrno(const char * msg)
	{
		if (errno == EAGAIN || errno == EINTR) {
			return;
		}
		perror(msg);
		throw std::runtime_error(std::string(msg));
	}

	Client * Cache::doAccept()
	{
		// Accept a new client
		int fd;
		if ((fd = accept(serverFd, 0, 0)) == -1) {
			handleErrno("accept");
			return nullptr;
		}

		return new Client(fd);
	}

	void Cache::processMessage(Client * c, uint16_t size)
	{
		// Decypher the message
//		printf("Message from %d (%d):\n", c->fd, c->readBufferPos);
		std::string jsonStr(c->readBuffer + 2, c->readBufferPos - 2);
//		printf("%s\n", jsonStr.c_str());
		c->readBufferPos = 0;
		auto json = nlohmann::json::parse(jsonStr);

		json["ok"] = true;
		std::string reply = json.dump(0);
		c->send(reply);
	}

	void Cache::server()
	{
		std::vector<Client *> clients;
		while(true) {
			pollfd polls[clients.size() + 1];

			pollfd * server;
			int pollCount = 0;

			server = polls + (pollCount++);
			server->fd = serverFd;
			server->events = POLLIN;

			for(int i = 0; i < clients.size(); ++i)
			{
				clients[i]->poll = polls + (pollCount++);
				clients[i]->poll->fd = clients[i]->fd;
				if (clients[i]->writeBufferLeft) {
					clients[i]->poll->events=POLLOUT;
				} else {
					clients[i]->poll->events=POLLIN;
				}

			}

			if (poll(polls, pollCount, 1000) == -1) {
				perror("poll");
				throw std::runtime_error("Unable to poll");
			}

			if (server->revents & POLLIN) {
				Client * c = doAccept();
				if (c != nullptr) {
					clients.push_back(c);
				}
			}

			for(int i = 0; i < clients.size(); ++i) {
				Client * c = clients[i];
				if (!c->poll) {
					continue;
				}
				if (c->writeBufferLeft && (c->poll->revents & POLLOUT)) {
					int wr = write(c->fd, c->writeBuffer + c->writeBufferPos, c->writeBufferLeft);
					if (wr == -1) {
						if (errno == EAGAIN || errno == EINTR) {
							// Just ignore
							continue;
						} else {
							c->kill();
						}
					} else {
						c->writeBufferLeft -= wr;
						if (c->writeBufferLeft == 0) {
							c->readBufferPos = 0;
						}
					}
				} else if ((!c->writeBufferLeft) && (c->poll->revents & POLLIN)) {
					int rd = read(c->fd, c->readBuffer + c->readBufferPos, MAX_MESSAGE_SIZE - c->readBufferPos);
					if (rd == -1) {
						if (errno == EAGAIN || errno == EINTR) {
							// Just ignore
							continue;
						} else {
							c->kill();
						}
					} else if (rd == 0) {
						c->kill();
					} else {
						// FIXME: read 0 ? possible ?
						c->readBufferPos += rd;
						if (c->readBufferPos > 2) {
							uint16_t size = *(uint16_t*)c->readBuffer;
							if (size >= MAX_MESSAGE_SIZE || size <= 2) {
								c->kill();
							} else if (size >= c->readBufferPos){
								// Process a message for the client.
								try {
									processMessage(c, size);
								} catch(const std::exception& ex) {
									std::cerr << "Error on client " << c->fd << ": "<< ex.what() << "\n";
									c->kill();
								}
							} else if (c->readBufferPos == MAX_MESSAGE_SIZE) {
								c->kill();
							}
						}
					}
				}
			}
			for(int i = 0; i < clients.size();) {
				Client  * c = clients[i];
				if (c->fd == -1) {
					delete(c);
					clients[i] = clients[clients.size() - 1];
					clients.pop_back();
				} else {
					i++;
				}
			}
		}
	}
}
