#ifndef CHILDPROCESS_H_
#define CHILDPROCESS_H_

#include <string>
#include <vector>

int system(const std::string & command, const std::vector<std::string> &  args);

#endif
