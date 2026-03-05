#!/usr/bin/env bash
set -euo pipefail

# Remote installer for screen2report.
# Typical usage:
#   curl -fsSL https://raw.githubusercontent.com/oryx2/s2r/main/install.sh | bash

DEFAULT_BASE_URL="https://raw.githubusercontent.com/oryx2/s2r/main/dist"
BASE_URL="${SCREEN2REPORT_BASE_URL:-${DEFAULT_BASE_URL}}"
VERSION="${SCREEN2REPORT_VERSION:-latest}"
INSTALL_DIR="${SCREEN2REPORT_INSTALL_DIR:-${HOME}/.screen2report}"
SKIP_AUTOINSTALL=0
SKIP_MODEL_CHECK=0
MODEL_REPO_ID="${MODEL_REPO_ID:-Qwen/Qwen3.5-0.8B}"

usage() {
  cat <<'EOF'
Usage: install.sh [options]

Options:
  --version <v>         Install specific version (default: latest)
  --base-url <url>      Release files base URL (default: https://openclaw.ai/dist)
  --install-dir <path>  Install target directory (default: ~/.screen2report)
  --skip-autoinstall    Do not run post-install setup
  --skip-model-check    Skip model check and auto-download
  --model-repo-id <id>  Model repository ID (default: Qwen/Qwen3.5-0.8B)
  -h, --help            Show this help

Environment overrides:
  SCREEN2REPORT_BASE_URL
  SCREEN2REPORT_VERSION
  SCREEN2REPORT_INSTALL_DIR
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --base-url)
      BASE_URL="$2"
      shift 2
      ;;
    --install-dir)
      INSTALL_DIR="$2"
      shift 2
      ;;
    --skip-autoinstall)
      SKIP_AUTOINSTALL=1
      shift
      ;;
    --skip-model-check)
      SKIP_MODEL_CHECK=1
      shift
      ;;
    --model-repo-id)
      MODEL_REPO_ID="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[ERROR] unknown arg: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[ERROR] macOS only (current: $(uname -s))" >&2
  exit 1
fi

for cmd in curl tar shasum awk mktemp rsync; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[ERROR] missing required command: ${cmd}" >&2
    exit 1
  fi
done

if [[ "${VERSION}" == "latest" ]]; then
  latest_url="${BASE_URL%/}/LATEST"
  echo "[INFO] resolving latest version from ${latest_url}"
  VERSION="$(curl -fsSL "${latest_url}" | tr -d '\r' | awk 'NF{print $1; exit}')"
  if [[ -z "${VERSION}" ]]; then
    echo "[ERROR] failed to resolve latest version from ${latest_url}" >&2
    exit 1
  fi
fi

PKG_NAME="screen2report-${VERSION}-macos"
ARCHIVE_NAME="${PKG_NAME}.tar.gz"
ARCHIVE_URL="${BASE_URL%/}/${ARCHIVE_NAME}"
SHA_URL="${ARCHIVE_URL}.sha256"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

ARCHIVE_PATH="${TMP_DIR}/${ARCHIVE_NAME}"
SHA_PATH="${TMP_DIR}/${ARCHIVE_NAME}.sha256"

echo "[INFO] downloading: ${ARCHIVE_URL}"
curl -fL "${ARCHIVE_URL}" -o "${ARCHIVE_PATH}"
echo "[INFO] downloading checksum: ${SHA_URL}"
curl -fL "${SHA_URL}" -o "${SHA_PATH}"

EXPECTED_SHA="$(awk '{print $1; exit}' "${SHA_PATH}")"
ACTUAL_SHA="$(shasum -a 256 "${ARCHIVE_PATH}" | awk '{print $1}')"
if [[ -z "${EXPECTED_SHA}" || -z "${ACTUAL_SHA}" ]]; then
  echo "[ERROR] checksum parse failed" >&2
  exit 1
fi
if [[ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]]; then
  echo "[ERROR] checksum mismatch" >&2
  echo " expected: ${EXPECTED_SHA}" >&2
  echo " actual  : ${ACTUAL_SHA}" >&2
  exit 1
fi
echo "[OK] checksum verified"

EXTRACT_DIR="${TMP_DIR}/extract"
mkdir -p "${EXTRACT_DIR}"
tar -xzf "${ARCHIVE_PATH}" -C "${EXTRACT_DIR}"

SRC_DIR="${EXTRACT_DIR}/${PKG_NAME}"
if [[ ! -d "${SRC_DIR}" ]]; then
  echo "[ERROR] extracted package dir not found: ${SRC_DIR}" >&2
  exit 1
fi

mkdir -p "${INSTALL_DIR}"
rsync -a --delete "${SRC_DIR}/" "${INSTALL_DIR}/"
echo "[OK] installed to: ${INSTALL_DIR}"

if [[ "${SKIP_AUTOINSTALL}" -eq 1 ]]; then
  echo "[INFO] skipped install_bundle.sh by request"
  exit 0
fi

echo "[INFO] running post-install setup..."
(
  cd "${INSTALL_DIR}"
  bash scripts/install_bundle.sh
)

# --- 检查并下载模型 ---
if [[ "${SKIP_MODEL_CHECK}" -eq 0 ]]; then
  MODELS_DIR="${INSTALL_DIR}/models"
  REPO_SHORT="${MODEL_REPO_ID##*/}"
  MODEL_DIR="${MODELS_DIR}/${REPO_SHORT}"

  has_model=0
  if [[ -d "${MODEL_DIR}" ]]; then
    gguf_count="$(find "${MODEL_DIR}" -maxdepth 1 -name '*.gguf' 2>/dev/null | wc -l | tr -d ' ')"
    if [[ "${gguf_count}" -gt 0 ]]; then
      has_model=1
    fi
  fi

  if [[ "${has_model}" -eq 0 ]]; then
    echo ""
    echo "============================================"
    echo "  [WARN] 本地模型未找到"
    echo "============================================"
    echo "  模型: ${MODEL_REPO_ID}"
    echo "  目录: ${MODEL_DIR}"
    echo ""
    echo "  请手动下载模型:"
    echo "  1. 访问 https://modelscope.cn/models/${MODEL_REPO_ID}"
    echo "  2. 下载 .gguf 文件到 ${MODEL_DIR}/"
    echo ""
    echo "  或使用 Hugging Face:"
    echo "  huggingface-cli download ${MODEL_REPO_ID} --local-dir ${MODEL_DIR}"
    echo "============================================"
    echo ""
    echo "[INFO] 安装完成，但模型需要手动下载"
  else
    echo "[INFO] 本地模型已存在: ${MODEL_DIR}"

    # --- 启动模型服务 ---
    echo ""
    echo "[INFO] 正在启动本地模型服务..."
    cd "${INSTALL_DIR}" && "${INSTALL_DIR}/bin/s2r" start
  fi
fi

echo ""
echo "[OK] 安装完成!"
echo ""
echo "[INFO] 安装目录: ${INSTALL_DIR}"
echo "[INFO] 二进制文件: ${INSTALL_DIR}/bin/s2r"
echo ""
echo "使用说明:"
echo "  s2r start   # 启动模型服务"
echo "  s2r stop    # 停止模型服务"
echo "  s2r status  # 查看服务状态"
