#!/usr/bin/env bash
set -euo pipefail

# Build release package for screen2report

VERSION="v0.2.2"

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="${PROJECT_DIR}/dist"
BUILD_DIR="${DIST_DIR}/build"

echo "[INFO] Building release package for ${VERSION}"

# Check for bun
if ! command -v bun >/dev/null 2>&1; then
  if [[ -x "$HOME/.bun/bin/bun" ]]; then
    export PATH="$HOME/.bun/bin:$PATH"
  else
    echo "[ERROR] bun not found. Please install bun first." >&2
    echo "  curl -fsSL https://bun.sh/install | bash" >&2
    exit 1
  fi
fi

echo "[INFO] Using bun: $(bun --version)"

# Clean and create build directory
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Create package directory
PKG_NAME="screen2report-${VERSION}-macos"
PKG_DIR="${BUILD_DIR}/${PKG_NAME}"
mkdir -p "${PKG_DIR}"

# Build TypeScript
echo "[INFO] Building TypeScript..."
cd "${PROJECT_DIR}"
npm run build

# Build binary with bun
echo "[INFO] Building binary with bun..."
bun build dist/cli.js --compile --outfile "${PKG_DIR}/bin/s2r"
chmod +x "${PKG_DIR}/bin/s2r"

# Copy necessary files
echo "[INFO] Copying files..."
mkdir -p "${PKG_DIR}/data/screenshots"
mkdir -p "${PKG_DIR}/data/analysis"
mkdir -p "${PKG_DIR}/reports"
mkdir -p "${PKG_DIR}/logs"
cp .env.example "${PKG_DIR}/"

# Create tarball
echo "[INFO] Creating tarball..."
cd "${BUILD_DIR}"
tar -czf "${PKG_NAME}.tar.gz" "${PKG_NAME}"

# Create checksum
shasum -a 256 "${PKG_NAME}.tar.gz" > "${PKG_NAME}.tar.gz.sha256"

# Move to dist
mv "${PKG_NAME}.tar.gz" "${DIST_DIR}/"
mv "${PKG_NAME}.tar.gz.sha256" "${DIST_DIR}/"
echo "${VERSION}" > "${DIST_DIR}/LATEST"

# Cleanup
rm -rf "${BUILD_DIR}"

echo "[OK] Release package created:"
echo "  ${DIST_DIR}/${PKG_NAME}.tar.gz"
echo "  ${DIST_DIR}/${PKG_NAME}.tar.gz.sha256"
echo ""
echo "Binary size: $(du -h ${DIST_DIR}/${PKG_NAME}.tar.gz | cut -f1)"
