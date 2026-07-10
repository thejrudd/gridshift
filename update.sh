#!/bin/bash
# Pull latest from GitHub and rebuild the Docker container
# Usage: ./update.sh

set -e

REPO="thejrudd/nfl-predictor"
BRANCH="main"
DIR="nfl-predictor-main"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_BACKUP=""

echo "Stopping current container..."
(cd "$SCRIPT_DIR" && docker compose down 2>/dev/null) || true
docker rm -f nfl-predictor 2>/dev/null || true

if [ -f "$PARENT_DIR/$DIR/.env" ]; then
  ENV_BACKUP="$(mktemp)"
  cp "$PARENT_DIR/$DIR/.env" "$ENV_BACKUP"
  echo "Preserved existing .env for restore after update."
fi

echo "Downloading latest from GitHub..."
cd "$PARENT_DIR"
rm -rf "$DIR"
curl -sL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" | tar xz

if [ -n "$ENV_BACKUP" ] && [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" "$DIR/.env"
  rm -f "$ENV_BACKUP"
  echo "Restored existing .env."
elif [ ! -f "$DIR/.env" ] && [ -f "$DIR/.env.example" ]; then
  cp "$DIR/.env.example" "$DIR/.env"
  echo "Created blank .env from .env.example. Add server-only values before enabling paid live data."
fi

echo "Rebuilding and starting container..."
cd "$DIR"
docker compose up -d --build

echo "Done! App is running."
docker ps --filter name=nfl-predictor --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
