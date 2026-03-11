#!/bin/sh
# deploy.sh — Sisyphus backend deployment script
# Persisted in workspace so cron sessions can use it
# Usage: sh /root/.openclaw/workspace/deploy.sh [--pull]

set -e

REPO_DIR="/root/.openclaw/workspace/agentic-intelligence"
ENV_FILE="$REPO_DIR/.env"
LOG_FILE="/tmp/api.log"
PID_FILE="/tmp/api.pid"

cd "$REPO_DIR"

# Optional: pull latest
if [ "$1" = "--pull" ]; then
  echo "[deploy] Pulling latest from main..."
  git pull origin main --rebase
fi

# Kill existing backend
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "[deploy] Killing old backend (PID $OLD_PID)..."
    kill "$OLD_PID"
    sleep 2
  fi
fi

# Also kill any stray ts-node/node api processes
ps aux | grep -E 'ts-node.*main\.ts|node.*packages/api' | grep -v grep | awk '{print $2}' | xargs kill 2>/dev/null || true
sleep 1

# Get version
TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "v0")
HASH=$(git rev-parse --short HEAD)
VERSION="${TAG}.${HASH}"

# Load env
if [ -f "$ENV_FILE" ]; then
  export $(cat "$ENV_FILE" | grep -v '^#' | xargs)
else
  echo "[deploy] ERROR: No .env file at $ENV_FILE"
  exit 1
fi

export BUILD_VERSION="$VERSION"

echo "[deploy] Starting backend v$VERSION..."
nohup ./packages/api/node_modules/.bin/ts-node packages/api/src/main.ts > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

sleep 4

# Verify
if kill -0 "$NEW_PID" 2>/dev/null; then
  HEALTH=$(curl -s http://localhost:3000/health 2>/dev/null)
  echo "[deploy] Backend running — PID $NEW_PID"
  echo "[deploy] Health: $HEALTH"
else
  echo "[deploy] ERROR: Backend failed to start"
  cat "$LOG_FILE"
  exit 1
fi
