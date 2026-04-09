#!/usr/bin/env bash
set -e

echo "Starting postgres..."
docker compose up -d postgres

echo "Waiting for postgres to be ready..."
until docker exec togit-postgres pg_isready -U postgres > /dev/null 2>&1; do
  sleep 1
done
echo "Postgres is ready."

echo "Building frontend..."
bun run --cwd apps/web build

echo "Starting backend server..."
bun apps/server/src/index.ts &
SERVER_PID=$!

echo "Starting frontend preview..."
bun run --cwd apps/web preview --host

# If preview exits, kill the server too
kill $SERVER_PID 2>/dev/null
