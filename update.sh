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

cd "$DIR"

# The web build peaks at about 1 GB of RAM (the offline-cache step after the
# bundle needs roughly 640 MB of Node heap). On a small VPS with no swap that
# exhausts memory and the kernel freezes or kills SSH and Docker itself.
MEM_KB="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
SWAP_KB="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
if [ "${MEM_KB:-0}" -gt 0 ] && [ $(( MEM_KB + SWAP_KB )) -lt 2500000 ]; then
  echo "Warning: this server has $(( MEM_KB / 1024 )) MB RAM and $(( SWAP_KB / 1024 )) MB swap." >&2
  echo "The build needs about 1 GB free. If the update stalls, add 2 GB of swap once:" >&2
  echo "  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile" >&2
  echo "  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab" >&2
fi

# Build one image at a time. `docker compose up --build` builds both images in
# parallel, stacking two npm installs on top of the web build.
# A failed build leaves the previous images tagged, so restart those instead
# of leaving the site down.
echo "Building API image..."
if ! docker compose build gridshift-api; then
  echo "API build failed; restarting the previous version." >&2
  docker compose up -d
  exit 1
fi
echo "Building web image..."
if ! docker compose build gridshift; then
  echo "Web build failed; restarting the previous version." >&2
  docker compose up -d
  exit 1
fi

echo "Starting containers..."
docker compose up -d

# Each update leaves the previous images untagged; remove them so they don't
# slowly fill the disk.
docker image prune -f >/dev/null || true

echo "Done! App is running."
docker compose ps
