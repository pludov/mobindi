#!/bin/bash

set -euo pipefail

INSTALL_DIR="$(dirname "$BASH_SOURCE")"

cd "$INSTALL_DIR"


# Rebuild if required
CURRENTREV="`git rev-parse HEAD`"
if [ "$CURRENTREV" == "" ]; then
    echo "Git is broken. Aborting" 2>&1
    exit 1
fi

ISCLEAN="`git status --porcelain`"
if [ "$ISCLEAN" != "" ]; then
    echo "WARNING: You're git repo is not clean - Automated build cannot be deduced from local modification" 2>&1
fi

if [ "$#" != 0 ] && [ "$1" == "--rebuild" ]; then
    shift
    LATESTBUILD=""
else
    if [ -f ".latestbuild" ]; then
        LATESTBUILD="`cat .latestbuild`"
    else
        LATESTBUILD=""
    fi
fi

if [ "$CURRENTREV" != "$LATESTBUILD" ]; then
    echo "Build required... Please wait" 2>&1
    rm -f .latestbuild
    ./build.sh
    echo "$CURRENTREV" >> .latestbuild
fi

# Startup nginx
./nginx/nginx.sh

exec npm start "$@"
