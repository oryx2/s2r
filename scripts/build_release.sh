#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DIST_DIR="${BASE_DIR}/dist"

VERSION="${VERSION:-$(date +%Y%m%d)}"
WITH_MODELS=0
BUILD_SWIFT_BINARIES=1
BUNDLE_LLAMA_RUNTIME=0
SCRIPT_WHITELIST=(
  "ensure_llama_server.sh"
  "install_bundle.sh"
  "uninstall_launchd.sh"
)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --with-models)
      WITH_MODELS=1
      shift
      ;;
    --skip-build-binaries)
      BUILD_SWIFT_BINARIES=0
      shift
      ;;
    --bundle-llama-runtime)
      BUNDLE_LLAMA_RUNTIME=1
      shift
      ;;
    --skip-app-bundle|--include-app-in-archive)
      echo "[WARN] app bundle options are ignored in CLI-only release"
      shift
      ;;
    *)
      echo "[ERROR] unknown arg: $1" >&2
      echo "Usage: bash scripts/build_release.sh [--version <v>] [--with-models] [--skip-build-binaries] [--bundle-llama-runtime]" >&2
      exit 2
      ;;
  esac
done

PKG_NAME="screen2report-${VERSION}-macos"
STAGE_DIR="${DIST_DIR}/${PKG_NAME}"
ARCHIVE="${DIST_DIR}/${PKG_NAME}.tar.gz"
CHECKSUM="${ARCHIVE}.sha256"
LATEST_FILE="${DIST_DIR}/LATEST"

mkdir -p "${DIST_DIR}"
rm -rf "${STAGE_DIR}" "${ARCHIVE}" "${CHECKSUM}"
mkdir -p "${STAGE_DIR}"

if [[ "${BUILD_SWIFT_BINARIES}" -eq 1 ]]; then
  bash "${BASE_DIR}/scripts/build_swift_binaries.sh"
fi
if [[ "${BUNDLE_LLAMA_RUNTIME}" -eq 1 ]]; then
  bash "${BASE_DIR}/scripts/prepare_llama_runtime.sh"
fi

copy_if_exists() {
  local src="$1"
  local dst="$2"
  if [[ -e "${src}" ]]; then
    mkdir -p "$(dirname "${dst}")"
    if [[ -d "${src}" ]]; then
      mkdir -p "${dst}"
      cp -R "${src}/." "${dst}/"
    else
      cp -f "${src}" "${dst}"
    fi
  fi
}

copy_whitelisted_scripts() {
  local target_dir="$1"
  local scripts_root="${BASE_DIR}/scripts"
  mkdir -p "${target_dir}"
  for script_name in "${SCRIPT_WHITELIST[@]}"; do
    if [[ -f "${scripts_root}/${script_name}" ]]; then
      cp -f "${scripts_root}/${script_name}" "${target_dir}/${script_name}"
      chmod +x "${target_dir}/${script_name}" 2>/dev/null || true
    fi
  done
}

copy_if_exists "${BASE_DIR}/README.md" "${STAGE_DIR}/README.md"
copy_if_exists "${BASE_DIR}/.env.example" "${STAGE_DIR}/.env.example"
copy_whitelisted_scripts "${STAGE_DIR}/scripts"
copy_if_exists "${BASE_DIR}/bin" "${STAGE_DIR}/bin"
copy_if_exists "${BASE_DIR}/runtime" "${STAGE_DIR}/runtime"

if [[ "${WITH_MODELS}" -eq 1 ]]; then
  copy_if_exists "${BASE_DIR}/models" "${STAGE_DIR}/models"
fi

find "${STAGE_DIR}" -type d -name "__pycache__" -prune -exec rm -rf {} + 2>/dev/null || true
find "${STAGE_DIR}" -type f -name "*.pyc" -delete 2>/dev/null || true

tar -C "${DIST_DIR}" -czf "${ARCHIVE}" "${PKG_NAME}"
shasum -a 256 "${ARCHIVE}" > "${CHECKSUM}"
printf "%s\n" "${VERSION}" > "${LATEST_FILE}"

echo "[OK] release archive: ${ARCHIVE}"
echo "[OK] checksum file : ${CHECKSUM}"
echo "[OK] latest marker : ${LATEST_FILE}"
if [[ "${WITH_MODELS}" -eq 0 ]]; then
  echo "[INFO] models/ not included (add --with-models to include)"
fi
if [[ "${BUILD_SWIFT_BINARIES}" -eq 0 ]]; then
  echo "[WARN] binaries not rebuilt (used existing bin/ content)"
fi
if [[ "${BUNDLE_LLAMA_RUNTIME}" -eq 1 ]]; then
  echo "[INFO] bundled runtime included: runtime/llama-server"
fi
