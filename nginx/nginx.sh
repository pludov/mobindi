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

CONF=nginx.conf
if [ "${PORT+x}" ]; then
	sed -e "s/:8080/:$PORT/g" nginx.conf > actual-nginx.conf
	CONF=actual-nginx.conf
fi

nginx -p "$PWD" -c ./$CONF 2> /dev/null
