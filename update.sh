#!/bin/bash
# Pull latest from GitHub and rebuild the Docker container
# Usage: ./update.sh

set -e

REPO="thejrudd/gridshift"
BRANCH="main"
# Install folder name. It also sets the Docker Compose project name, which
# names the data volume, so keep it stable even if the repo is renamed.
DIR="nfl-predictor-main"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PARENT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_BACKUP=""

# Download before stopping anything, so a failed download leaves the app running.
echo "Downloading latest from GitHub..."
STAGING="$(mktemp -d "$PARENT_DIR/.gridshift-update.XXXXXX")"
trap 'rm -rf "$STAGING"' EXIT
# --strip-components drops GitHub's "<repo>-<branch>/" top folder, which
# changes whenever the repo is renamed.
curl -fsSL "https://github.com/$REPO/archive/refs/heads/$BRANCH.tar.gz" \
  | tar xz -C "$STAGING" --strip-components=1
if [ ! -f "$STAGING/docker-compose.yml" ]; then
  echo "Download did not contain docker-compose.yml; leaving the current install running." >&2
  exit 1
fi

echo "Stopping current container..."
(cd "$SCRIPT_DIR" && docker compose down 2>/dev/null) || true
docker rm -f nfl-predictor 2>/dev/null || true

if [ -f "$PARENT_DIR/$DIR/.env" ]; then
  ENV_BACKUP="$(mktemp)"
  cp "$PARENT_DIR/$DIR/.env" "$ENV_BACKUP"
  echo "Preserved existing .env for restore after update."
fi

cd "$PARENT_DIR"
rm -rf "$DIR"
mv "$STAGING" "$DIR"

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
docker compose ps
