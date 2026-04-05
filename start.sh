#!/bin/sh
cd "$(dirname "$0")"
exec node dist/server.js
