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

if [ ! -f nginx-selfsigned.key ] \
        || [ ! -f nginx-selfsigned.crt ] \
        || [ "$(find nginx-selfsigned.key -mtime +360)" ] \
        || [ "$(find nginx-selfsigned.crt -mtime +360)" ]; then
    which openssl > /dev/null || (echo "Installation of openssl required" >&2; sudo apt install openssl)

    echo "SSL certificate required" >&2

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -subj "/C=GB/ST=London/L=London/O=Global Security/OU=IT Department/CN=example.com" \
            -keyout /tmp/nginx-selfsigned.key -out /tmp/nginx-selfsigned.crt

    mv /tmp/nginx-selfsigned.key /tmp/nginx-selfsigned.crt .
fi
