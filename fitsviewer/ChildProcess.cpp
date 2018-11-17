#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#include "ChildProcess.h"

#include "SharedCacheServer.h"

int system(const std::string & command, const std::vector<std::string> &  argStrs)
{
    pid_t pid;
    int status;
    pid_t ret;

    /* ... Sanitize arguments ... */
    pid = fork();
    if (pid == -1) {
        /* Handle error */
        throw SharedCache::WorkerError::fromErrno(errno, "fork");
    } else if (pid != 0) {
        while ((ret = waitpid(pid, &status, 0)) == -1) {
            if (errno != EINTR) {
                throw SharedCache::WorkerError::fromErrno(errno, "waitpid");
            }
        }

        /* Report unexpected child status */
        if (!WIFEXITED(status)) {
            throw SharedCache::WorkerError(command + ": abnormal termination");
        }
        return WEXITSTATUS(status);
    } else {
        // FIXME: close filedesc/set close on exec
        const char * args[argStrs.size() + 2];
        write(2, "forked successfull forked successfull forked successfull successfull forked successfull forked successfull successfull forked successfull forked successfull successfull forked successfull forked successfull successfull forked successfull forked successfull successfull forked successfull forked successfull successfull forked successfull forked successfull successfull forked successfull forked successfull successfull forked successfull forked successfull successfull forked successfull forked successfull successfull forked successfull forked successfull",  150);
        args[0] = command.c_str();
        for(size_t i = 0; i < argStrs.size(); ++i) {
            args[i + 1] = argStrs[i].c_str();
        }
        args[argStrs.size() + 1] = nullptr;

        execvp(command.c_str(), (char * const *) args);
        perror(command.c_str());
        /* Handle error */
        _Exit(127);
    }
    return 0;
}