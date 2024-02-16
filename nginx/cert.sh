#!/bin/bash

set -euo pipefail

INSTALL_DIR="$(dirname "$BASH_SOURCE")"

cd "$INSTALL_DIR"

LOGDIR=""

if [ -f ../mobindi.conf ]; then
    . ../mobindi.conf
fi


[[ ":$PATH:" != *":/usr/sbin:"* ]] && PATH="${PATH}:/usr/sbin"


mkdir --parents certs
cd certs

PASSWORD=helloworld

if [ ! -f ca.key ]; then
	openssl genrsa -passout "pass:$PASSWORD"  -aes256 -out ca.key 2048
fi

DEVICE="$(hostname)"
DEVICENAME="$DEVICE.local"

if [ ! -f ca.crt ]; then
	openssl req -new -extensions v3_ca -batch -utf8  \
		-passin "pass:$PASSWORD" \
		-key ca.key -out ca.csr \
		-subj "/CN=Mobindi $DEVICE Root CA/"
	cat <<EOF >caext.ini
basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign
subjectKeyIdentifier = hash
nameConstraints = critical, permitted;DNS:$DEVICENAME
EOF
	openssl x509 \
		-passin "pass:$PASSWORD" \
		-req -sha256 -days 7200 -in ca.csr -signkey ca.key -extfile caext.ini -out ca.crt
fi

if [ ! -f ca.srl ]; then
	echo 1000 > ca.srl
fi

# Every ~ 100 days, regenerate the server certificate
if [ ! -f server-chain.crt ] || [ "$(( $(date +"%s") - $(stat -c "%Y" "server-chain.crt") ))" -gt "8640000" ]; then
	openssl genrsa -passout "pass:$PASSWORD" -aes256 -out server-tmp.key 2048
	openssl rsa -passin "pass:$PASSWORD" -in server-tmp.key -out server.key
	rm server-tmp.key

	openssl req -new -passin "pass:$PASSWORD" \
		-key server.key -extensions v3_ca -batch -out server.csr -utf8 -subj "/CN=Mobindi $DEVICE"
	cat <<'EOF' >certext.ini
basicConstraints        = critical,CA:false
subjectKeyIdentifier    = hash
authorityKeyIdentifier  = keyid:always
nsCertType              = server
authorityKeyIdentifier  = keyid,issuer:always
keyUsage                = critical, digitalSignature, keyEncipherment
extendedKeyUsage        = serverAuth
subjectAltName          = ${ENV::CERT_SAN}
EOF

	CERT_SAN="DNS:$DEVICENAME" openssl x509 -req -sha256 -days 365 -in server.csr \
		-passin "pass:$PASSWORD" -CAkey ca.key -CA ca.crt -out server.crt -extfile certext.ini

	cat server.crt ca.crt > server-chain.crt
fi

