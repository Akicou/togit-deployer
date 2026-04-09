#!/usr/bin/env bash
set -e

echo "Building frontend..."
bun run --cwd apps/web build

echo "Starting backend server..."
bun apps/server/src/index.ts &
SERVER_PID=$!

echo "Starting frontend preview..."
bun run --cwd apps/web preview --host

# If preview exits, kill the server too
kill $SERVER_PID 2>/dev/null
