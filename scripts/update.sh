#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

old_version=$(node -e "console.log(require('./package.json').version)")
echo "Current version: $old_version"

echo "Pulling latest changes..."
git pull

new_version=$(node -e "console.log(require('./package.json').version)")

# Ensure watchers.json exists as a file (required for Docker bind mount).
# Docker creates a directory if the file doesn't exist at mount time.
if [ -d watchers.json ]; then
  rmdir watchers.json
fi
if [ ! -f watchers.json ]; then
  echo "[]" > watchers.json
  echo "Created watchers.json"
fi

echo "Rebuilding and restarting containers..."
docker compose up -d --build

echo "Updated: v$old_version -> v$new_version"
