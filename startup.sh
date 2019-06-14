#!/bin/bash

set -euo pipefail

INSTALL_DIR="$(dirname "$BASH_SOURCE")"

cd "$INSTALL_DIR"

LOGDIR=""

if [ -f ./mobindi.conf ]; then
    . ./mobindi.conf
fi

# Leave reasonable time to die
while pkill -U "$UID" -fx "node dist/app.js"; do
	echo "Killing previous instance" >&2
	sleep 0.25
done

if [ "$LOGDIR" != "" ]; then
	echo "Logging into $LOGDIR"
	exec < /dev/null
	exec > >( multilog 's9999999' "$LOGDIR" )
	exec 2>&1
fi


# Startup nginx
./nginx/nginx.sh

exec npm start "$@"
