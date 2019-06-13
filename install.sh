#!/bin/bash

set -euo pipefail

INSTALL_DIR="$(dirname "$BASH_SOURCE")"

cd "$INSTALL_DIR"


LOGDIR=""

if [ -f ./mobindi.conf ]; then
    . ./mobindi.conf
fi

UPDATECONF=0
FORCE_BUILD=0
while [ "$#" != 0 ]; do
    case "$1" in
        --log-dir)
                shift
                LOGDIR="$1"
                shift
                UPDATECONF=1
                ;;
        --no-log-dir)
                shift
                LOGDIR=""
                UPDATECONF=1
                ;;
        --force-build)
                shift
                FORCE_BUILD=1
                ;;
        *)
                echo "Usage: $0 [--log-dir logdirectory] [--no-log-dir] [--force-build]"
                exit 1
                ;;
    esac
done

printf "Settings:\n * Log directory: %s\n" "$LOGDIR"

if [ "$UPDATECONF" != 0 ]; then
    printf "LOGDIR='%q'" "$LOGDIR" > ./.mobindi.conf.tmp
    mv ./.mobindi.conf.tmp ./mobindi.conf
fi

if [ "${LOGDIR-}" != "" ]; then
	which multilog > /dev/null || (echo "Installation of daemontools required" >&2 ; sudo apt install daemontools)
	[ -d "$LOGDIR" ] || sudo mkdir -p -- "$LOGDIR"
	[ -w "$LOGDIR" ] || sudo chown "$UID" -R -- "$LOGDIR"
fi

# Rebuild if required
CURRENTREV="`git rev-parse HEAD`"
if [ "$CURRENTREV" == "" ]; then
    echo "Git repo is broken. Aborting" 2>&1
    exit 1
fi

if [ "$FORCE_BUILD" != 0 ]; then
    LATESTBUILD=""
else
    ISCLEAN="`git status --porcelain`"
    if [ "$ISCLEAN" != "" ]; then
        echo "WARNING: You're git repo is not clean - Automated build cannot be deduced from local modification" 2>&1
    fi
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

# Setup nginx
./nginx/install.sh

echo "System ready" >&2