#!/bin/bash

set -euo pipefail

INSTALL_DIR="$(dirname "$BASH_SOURCE")"

cd "$INSTALL_DIR"

LOGDIR=""

if [ -f ../mobindi.conf ]; then
    . ../mobindi.conf
fi


[[ ":$PATH:" != *":/usr/sbin:"* ]] && PATH="${PATH}:/usr/sbin"

if [ -f "nginx.pid" ]; then
    if kill -HUP "`cat nginx.pid`" ; then
        echo "Nginx reloaded" >&2
        exit 0
    fi
fi


nginx -p "$PWD" -c ./nginx.conf 2> /dev/null
