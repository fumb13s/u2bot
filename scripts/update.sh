#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

old_version=$(node -e "console.log(require('./package.json').version)")
echo "Current version: $old_version"

echo "Pulling latest changes..."
git pull

new_version=$(node -e "console.log(require('./package.json').version)")

echo "Rebuilding and restarting containers..."
docker compose up -d --build

echo "Updated: v$old_version -> v$new_version"
