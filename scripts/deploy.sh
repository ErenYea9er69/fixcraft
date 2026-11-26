#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <image-tag>   (example: $0 v1.0.0)"
  exit 1
fi

TAG="$1"
HEALTH_URL="${HEALTH_URL:-http://localhost:3001/health}"

if [[ ! -f .env ]]; then
  echo "Missing .env file. Run: cp .env.example .env"
  exit 1
fi

export IMAGE_TAG="${TAG}"

if [[ "${PULL_IMAGE:-true}" == "true" ]]; then
  echo "Pulling published image tag ${IMAGE_TAG} (no rebuild)..."
  docker compose pull app
fi

echo "Deploying FixCraft version ${IMAGE_TAG} without rebuilding..."
docker compose up -d --no-build

echo "Waiting for health check at ${HEALTH_URL}..."
for _ in $(seq 1 15); do
  if response="$(curl --fail --silent "${HEALTH_URL}")"; then
    echo "Service healthy: ${response}"
    exit 0
  fi
  sleep 2
done

echo "Deployment failed health check!"
docker compose logs --tail=50 app
exit 1
