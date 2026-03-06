#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
BIN_DIR="${BASE_DIR}/bin"
CONFIGURATION="${CONFIGURATION:-release}"

if ! command -v swift >/dev/null 2>&1; then
  echo "[ERROR] swift not found. Install Xcode Command Line Tools first." >&2
  exit 2
fi

pushd "${BASE_DIR}" >/dev/null
swift build -c "${CONFIGURATION}" --product s2r
BIN_PATH="$(swift build -c "${CONFIGURATION}" --show-bin-path)"
popd >/dev/null

mkdir -p "${BIN_DIR}"
rm -f "${BIN_DIR}/s2r-capture" "${BIN_DIR}/s2r-report" "${BIN_DIR}/s2r-model" "${BIN_DIR}/s2r-ui"
cp "${BIN_PATH}/s2r" "${BIN_DIR}/s2r"

chmod +x "${BIN_DIR}/s2r"
echo "[OK] swift binaries ready in ${BIN_DIR}"
