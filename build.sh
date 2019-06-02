#!/bin/bash

set -euo pipefail

echo '*************************************************'
echo '***                                           ***'
echo '***           Building Back office            ***'
echo '***                                           ***'
echo '*************************************************'

npm install && npm run-script build

echo '*************************************************'
echo '***                                           ***'
echo '***         Building processing CGI           ***'
echo '***                                           ***'
echo '*************************************************'

(cd fitsviewer && cmake . && make -j2 )

echo '*************************************************'
echo '***                                           ***'
echo '***                Building UI                ***'
echo '***                                           ***'
echo '*************************************************'

( cd ui && npm install && npm run-script build)


