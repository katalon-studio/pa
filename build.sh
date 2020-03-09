#!/bin/sh
set -ex

rm -rf tracking.zip
npm install
zip -r tracking.zip ./node_modules/* index.js