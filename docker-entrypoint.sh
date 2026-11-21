#!/bin/sh
set -e

mkdir -p /data/uploads

# Ensure SQLite schema is initialized / up to date in the persistent volume
./node_modules/.bin/prisma db push --skip-generate --schema=backend/prisma/schema.prisma

exec node backend/dist/server.js
