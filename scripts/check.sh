#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] Running test suite..."
npm test

echo "[2/3] Building frontend bundle..."
npm run build

if [[ -n "${HEALTH_URL:-}" ]]; then
  echo "[3/3] Checking service health at ${HEALTH_URL}..."
  response="$(curl --fail --silent --show-error "${HEALTH_URL}")"
  echo "${response}" | grep -q '"status":"ok"'
  echo "Health check passed: ${response}"
else
  echo "[3/3] Skipping live HTTP health check (set HEALTH_URL to enable)."
fi

echo "All checks passed."
