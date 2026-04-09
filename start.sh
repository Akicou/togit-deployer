#!/usr/bin/env bash
set -e

echo "Building..."
bun run --cwd apps/web build

echo "Starting preview server..."
bun run --cwd apps/web preview --host
