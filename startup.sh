#!/bin/bash

set -euo pipefail

INSTALL_DIR="$(dirname "$BASH_SOURCE")"

cd "$INSTALL_DIR"

LOGDIR=""
export NODE_ENV=""

if [ -f ./mobindi.conf ]; then
    . ./mobindi.conf
fi

# Leave reasonable time to die
while pkill -U "$UID" -fx "node dist/app.js"; do
	echo "Killing previous instance" >&2
	sleep 0.25
done

if [ "$LOGDIR" != "" ]; then
	export MOBINDI_LOGDIR="$LOGDIR"
fi

if [ "${PORT+x}" ]; then
	export PORT
fi

if [ -z "$NODE_ENV" ]; then
	export NODE_ENV=prod
fi

# Startup nginx
./nginx/nginx.sh

exec npm start "$@"
