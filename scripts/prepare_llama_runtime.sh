#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
RUNTIME_DIR="${BASE_DIR}/runtime"
LIB_DIR="${RUNTIME_DIR}/lib"
LLAMA_BINARY="${LLAMA_BINARY:-}"
LLAMA_RUNTIME_SOURCE="${LLAMA_RUNTIME_SOURCE:-release}" # release | local
LLAMA_RELEASE_REPO="${LLAMA_RELEASE_REPO:-ggml-org/llama.cpp}"
LLAMA_RELEASE_TAG="${LLAMA_RELEASE_TAG:-latest}"
LLAMA_RELEASE_ASSET_NAME="${LLAMA_RELEASE_ASSET_NAME:-}"
LLAMA_RELEASE_ASSET_URL="${LLAMA_RELEASE_ASSET_URL:-}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

resolve_release_tag() {
  local api_url
  if [[ "${LLAMA_RELEASE_TAG}" == "latest" ]]; then
    api_url="https://api.github.com/repos/${LLAMA_RELEASE_REPO}/releases/latest"
  else
    api_url="https://api.github.com/repos/${LLAMA_RELEASE_REPO}/releases/tags/${LLAMA_RELEASE_TAG}"
  fi
  local payload
  payload="$(curl -fsSL "${api_url}")"
  local tag
  tag="$(printf '%s' "${payload}" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  if [[ -z "${tag}" ]]; then
    echo "[ERROR] cannot resolve release tag from ${api_url}" >&2
    exit 2
  fi
  echo "${tag}"
}

download_release_archive() {
  local arch raw_arch tag asset url archive
  raw_arch="$(uname -m)"
  case "${raw_arch}" in
    arm64|aarch64) arch="arm64" ;;
    x86_64) arch="x64" ;;
    *)
      echo "[ERROR] unsupported macOS arch: ${raw_arch}" >&2
      exit 2
      ;;
  esac

  tag="$(resolve_release_tag)"
  if [[ -n "${LLAMA_RELEASE_ASSET_NAME}" ]]; then
    asset="${LLAMA_RELEASE_ASSET_NAME}"
  else
    asset="llama-${tag}-bin-macos-${arch}.tar.gz"
  fi

  if [[ -n "${LLAMA_RELEASE_ASSET_URL}" ]]; then
    url="${LLAMA_RELEASE_ASSET_URL}"
  else
    url="https://github.com/${LLAMA_RELEASE_REPO}/releases/download/${tag}/${asset}"
  fi
  archive="${TMP_DIR}/${asset}"

  echo "[INFO] downloading llama runtime: ${url}" >&2
  curl -fL --retry 3 --retry-delay 2 -o "${archive}" "${url}"
  echo "${archive}"
}

extract_release_runtime() {
  local archive extract_dir
  archive="$1"
  extract_dir="${TMP_DIR}/extract"
  mkdir -p "${extract_dir}"
  tar -xzf "${archive}" -C "${extract_dir}"

  local server_path
  server_path="$(find "${extract_dir}" -type f -name 'llama-server' | head -n 1 || true)"
  if [[ -z "${server_path}" ]]; then
    echo "[ERROR] llama-server not found in downloaded archive" >&2
    exit 2
  fi
  echo "${server_path}"
}

mkdir -p "${RUNTIME_DIR}" "${LIB_DIR}"
if [[ "${LLAMA_RUNTIME_SOURCE}" == "release" ]]; then
  archive_path="$(download_release_archive)"
  LLAMA_BINARY="$(extract_release_runtime "${archive_path}")"
elif [[ "${LLAMA_RUNTIME_SOURCE}" == "local" ]]; then
  if [[ -z "${LLAMA_BINARY}" ]]; then
    if command -v llama-server >/dev/null 2>&1; then
      LLAMA_BINARY="$(command -v llama-server)"
    else
      echo "[ERROR] llama-server not found. Install llama.cpp first on the build machine." >&2
      echo "[ERROR] Example: brew install llama.cpp" >&2
      exit 2
    fi
  fi
else
  echo "[ERROR] unsupported LLAMA_RUNTIME_SOURCE=${LLAMA_RUNTIME_SOURCE} (use release|local)" >&2
  exit 2
fi

if [[ ! -x "${LLAMA_BINARY}" ]]; then
  echo "[ERROR] LLAMA_BINARY is not executable: ${LLAMA_BINARY}" >&2
  exit 2
fi

cp -f "${LLAMA_BINARY}" "${RUNTIME_DIR}/llama-server"
chmod +x "${RUNTIME_DIR}/llama-server"

# Also copy dylibs shipped in release bundle if present.
if [[ "${LLAMA_RUNTIME_SOURCE}" == "release" ]]; then
  if [[ -n "${archive_path:-}" ]]; then
    extract_root="${TMP_DIR}/extract"
    while IFS= read -r dylib; do
      cp -f "${dylib}" "${LIB_DIR}/"
    done < <(find "${extract_root}" -type f -name '*.dylib')
  fi
fi

# Copy Homebrew dynamic deps so end-user does not need local llama.cpp install.
while IFS= read -r dep; do
  case "${dep}" in
    /opt/homebrew/*|/usr/local/*)
      if [[ -f "${dep}" ]]; then
        cp -f "${dep}" "${LIB_DIR}/"
      fi
      ;;
  esac
done < <(otool -L "${RUNTIME_DIR}/llama-server" | awk 'NR>1 {print $1}')

# Relink server -> bundled libs.
if [[ -d "${LIB_DIR}" ]]; then
  while IFS= read -r dep; do
    base="$(basename "${dep}")"
    if [[ -f "${LIB_DIR}/${base}" ]]; then
      install_name_tool -change "${dep}" "@executable_path/lib/${base}" "${RUNTIME_DIR}/llama-server" || true
    fi
  done < <(otool -L "${RUNTIME_DIR}/llama-server" | awk 'NR>1 {print $1}')
fi

# Relink bundled libs -> bundled libs (recursive one pass).
for lib in "${LIB_DIR}"/*.dylib; do
  [[ -e "${lib}" ]] || continue
  chmod u+w "${lib}" || true
  install_name_tool -id "@executable_path/lib/$(basename "${lib}")" "${lib}" || true
  while IFS= read -r dep; do
    base="$(basename "${dep}")"
    if [[ -f "${LIB_DIR}/${base}" ]]; then
      install_name_tool -change "${dep}" "@executable_path/lib/${base}" "${lib}" || true
    fi
  done < <(otool -L "${lib}" | awk 'NR>1 {print $1}')
done

xattr -dr com.apple.quarantine "${RUNTIME_DIR}" 2>/dev/null || true

echo "[OK] bundled runtime binary: ${RUNTIME_DIR}/llama-server"
if compgen -G "${LIB_DIR}/*.dylib" > /dev/null; then
  echo "[OK] bundled runtime libs in: ${LIB_DIR}"
else
  echo "[INFO] no extra dynamic libs copied (likely static/self-contained binary)"
fi
