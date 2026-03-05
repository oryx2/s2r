#!/usr/bin/env bash
set -euo pipefail

# Post-install setup script (called by install.sh)
# This script sets up the environment after the package is extracted.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Create .env from example if not exists
if [[ ! -f "${BASE_DIR}/.env" ]]; then
  if [[ -f "${BASE_DIR}/.env.example" ]]; then
    cp "${BASE_DIR}/.env.example" "${BASE_DIR}/.env"
    echo "[INFO] created .env from .env.example"
  fi
fi

# Create necessary directories
mkdir -p "${BASE_DIR}/logs"
mkdir -p "${BASE_DIR}/run"

echo "[OK] setup complete"
echo "[INFO] binary: ${BASE_DIR}/bin/s2r"
echo "[INFO] usage: s2r {start|stop|status}"
