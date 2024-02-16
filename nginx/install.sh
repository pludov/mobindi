#!/bin/bash

set -euo pipefail

INSTALL_DIR="$(dirname "$BASH_SOURCE")"

cd "$INSTALL_DIR"

LOGDIR=""

if [ -f ../mobindi.conf ]; then
    . ../mobindi.conf
fi

[[ ":$PATH:" != *":/usr/sbin:"* ]] && PATH="${PATH}:/usr/sbin"

which nginx > /dev/null || (echo "Installation of nginx required" >&2 ; sudo apt install nginx)
which openssl > /dev/null || (echo "Installation of openssl required" >&2; sudo apt install openssl)
which capsh > /dev/null || (echo "Installation of libcap2-bin required" >&2; sudo apt install libcap2-bin)
which avahi-daemon > /dev/null || (echo "Installation of avahi-daemon required" >&2; sudo apt install avahi-daemon)

./cert.sh

