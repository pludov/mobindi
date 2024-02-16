#!/bin/bash

set -euo pipefail

INSTALL_DIR="$(dirname "$BASH_SOURCE")"

cd "$INSTALL_DIR"

LOGDIR=""

# Default port is 443
PUBLIC_PORT="${PUBLIC_PORT:-443}"
PORT="${PORT:-8080}"

if [ -f ../mobindi.conf ]; then
    . ../mobindi.conf
fi

[[ ":$PATH:" != *":/usr/sbin:"* ]] && PATH="${PATH}:/usr/sbin"

./cert.sh

if [ -f "nginx.pid" ]; then
    if kill -HUP "`cat nginx.pid`" ; then
        echo "Nginx reloaded" >&2
        exit 0
    fi
fi

CONF=nginx.conf
if [ "${PORT:-}" != 8080 ] || [ "${PUBLIC_PORT}" != 8443 ]; then
	sed -e "s/:8080/:$PORT/g" -e "s/:8443/:$PUBLIC_PORT/g" nginx.conf > actual-nginx.conf
	CONF=actual-nginx.conf
fi


COMMAND=(nginx -p "$PWD" -c "./$CONF")
# Check if port is lower than 1024
if [ ${PUBLIC_PORT:-9999} -lt 1024 ]; then
    printf -v cmd '%q ' "${COMMAND[@]}"
    echo "Running with elevated privileges: $cmd" >&2
    # cmd="ls -al /proc/self/fd /dev/pts"
    # | cat is required to ensure the output is sent to the terminal if there is one.
    sudo -E capsh --keep=1 --caps="cap_setuid,cap_setgid,cap_setpcap+ep cap_net_bind_service+eip" --user="$USER" --addamb=cap_net_bind_service -- -c "$cmd 2> /dev/null" < /dev/null | ( cat & )
else
    "${COMMAND[@]}" 2> /dev/null
fi
