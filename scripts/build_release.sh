#!/usr/bin/env bash
set -euo pipefail

# Build release package for screen2report

VERSION="v0.2.0"

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

# Clean and create build directory
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Create package directory
PKG_NAME="screen2report-ts-${VERSION}-macos"
PKG_DIR="${BUILD_DIR}/${PKG_NAME}"
mkdir -p "${PKG_DIR}"

# Build TypeScript
echo "[INFO] Building TypeScript..."
cd "${PROJECT_DIR}"
npm run build

# Copy files
echo "[INFO] Copying files..."
rsync -av --exclude='.git' --exclude='node_modules' \
  "${PROJECT_DIR}/" "${PKG_DIR}/"

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
