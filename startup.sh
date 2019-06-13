#!/bin/bash

set -euo pipefail

INSTALL_DIR="$(dirname "$BASH_SOURCE")"

cd "$INSTALL_DIR"

LOGDIR=""

if [ -f ./mobindi.conf ]; then
    . ./mobindi.conf
fi

if [ "$LOGDIR" != "" ]; then
	echo "Logging into $LOGDIR"
	exec < /dev/null
	exec > >( multilog '.s9999999' "$LOGDIR" )
	exec 2>&1
fi


# Startup nginx
./nginx/nginx.sh

# Leave reasonable time to die
( pkill -U "$UID" -fx "node dist/app.js" && sleep 0.5 ) || /bin/true

exec npm start "$@"
