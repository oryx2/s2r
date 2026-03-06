#!/usr/bin/env bash
set -euo pipefail

# Remote installer for screen2report TypeScript version.

DEFAULT_OWNER_REPO="oryx2/s2r"
DEFAULT_BASE_URL="https://github.com/${DEFAULT_OWNER_REPO}/releases/download"
OWNER_REPO="${SCREEN2REPORT_OWNER_REPO:-${DEFAULT_OWNER_REPO}}"
BASE_URL="${SCREEN2REPORT_BASE_URL:-${DEFAULT_BASE_URL}}"
VERSION="${SCREEN2REPORT_VERSION:-latest}"
INSTALL_DIR="${SCREEN2REPORT_INSTALL_DIR:-${HOME}/.screen-report}"
SKIP_MODEL_CHECK=0
MODEL_REPO_ID="${MODEL_REPO_ID:-Qwen/Qwen3.5-0.8B}"

usage() {
  cat <<'EOF'
Usage: install-ts.sh [options]

Options:
  --version <v>         Install specific version (default: latest)
  --base-url <url>      Release files base URL
  --install-dir <path>  Install target directory (default: ~/.screen-report)
  --skip-model-check    Skip model check and auto-download
  --model-repo-id <id>  Model repository ID (default: Qwen/Qwen3.5-0.8B)
  -h, --help            Show this help
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

# Check for Node.js
if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js not found. Please install Node.js 18+ first." >&2
  echo "  brew install node" >&2
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
REQUIRED_VERSION="18.0.0"
if [[ "$(printf '%s\n' "$REQUIRED_VERSION" "$NODE_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]]; then
  echo "[ERROR] Node.js version $NODE_VERSION is too old. Required: $REQUIRED_VERSION+" >&2
  exit 1
fi

echo "[INFO] Node.js version: $NODE_VERSION"

for cmd in curl tar shasum awk mktemp rsync; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "[ERROR] missing required command: ${cmd}" >&2
    exit 1
  fi
done

if [[ "${VERSION}" == "latest" ]]; then
  echo "[INFO] resolving latest release tag for ${OWNER_REPO} via GitHub API"
  api_url="https://api.github.com/repos/${OWNER_REPO}/releases/latest"
  VERSION="$(curl -fsSL "${api_url}" | awk -F '"' '/"tag_name":/ {print $4; exit}')"
  if [[ -z "${VERSION}" ]]; then
    echo "[ERROR] failed to resolve latest release tag from ${api_url}" >&2
    exit 1
  fi
  echo "[INFO] latest release tag: ${VERSION}"
fi

PKG_NAME="screen2report-ts-${VERSION}-macos"
ARCHIVE_NAME="${PKG_NAME}.tar.gz"
ARCHIVE_URL="${BASE_URL%/}/${VERSION}/${ARCHIVE_NAME}"
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

# Install Node.js dependencies
echo "[INFO] installing Node.js dependencies..."
cd "${INSTALL_DIR}"
npm install --production

# Create .env if not exists
if [[ ! -f "${INSTALL_DIR}/.env" ]]; then
  if [[ -f "${INSTALL_DIR}/.env.example" ]]; then
    cp "${INSTALL_DIR}/.env.example" "${INSTALL_DIR}/.env"
    echo "[INFO] created .env from .env.example"
  fi
fi

# Create necessary directories
mkdir -p "${INSTALL_DIR}/logs"
mkdir -p "${INSTALL_DIR}/run"

# Create wrapper script
BIN_DIR="${INSTALL_DIR}/bin"
mkdir -p "${BIN_DIR}"
cat > "${BIN_DIR}/s2r" <<EOF
#!/bin/bash
exec node "${INSTALL_DIR}/dist/cli.js" "\$@"
EOF
chmod +x "${BIN_DIR}/s2r"

# Install launchd services
echo "[INFO] installing scheduled tasks..."
LAUNCHD_DIR="${HOME}/Library/LaunchAgents"
mkdir -p "${LAUNCHD_DIR}"

CAPTURE_LABEL="com.screen2report.capture"
REPORT_LABEL="com.screen2report.report"

cat > "${LAUNCHD_DIR}/${CAPTURE_LABEL}.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${CAPTURE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${BIN_DIR}/s2r</string>
      <string>capture</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>
    <key>StandardOutPath</key>
    <string>${INSTALL_DIR}/logs/capture.out.log</string>
    <key>StandardErrorPath</key>
    <string>${INSTALL_DIR}/logs/capture.err.log</string>
  </dict>
</plist>
EOF

cat > "${LAUNCHD_DIR}/${REPORT_LABEL}.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${REPORT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${BIN_DIR}/s2r</string>
      <string>report</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>
      <integer>18</integer>
      <key>Minute</key>
      <integer>30</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>WorkingDirectory</key>
    <string>${INSTALL_DIR}</string>
    <key>StandardOutPath</key>
    <string>${INSTALL_DIR}/logs/report.out.log</string>
    <key>StandardErrorPath</key>
    <string>${INSTALL_DIR}/logs/report.err.log</string>
  </dict>
</plist>
EOF

# Load services
launchctl bootout "gui/$(id -u)/${CAPTURE_LABEL}" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/${REPORT_LABEL}" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "${LAUNCHD_DIR}/${CAPTURE_LABEL}.plist"
launchctl bootstrap "gui/$(id -u)" "${LAUNCHD_DIR}/${REPORT_LABEL}.plist"
launchctl enable "gui/$(id -u)/${CAPTURE_LABEL}"
launchctl enable "gui/$(id -u)/${REPORT_LABEL}"

echo "[OK] scheduled tasks installed"
echo "[INFO]   Capture: every 5 minutes"
echo "[INFO]   Report:  daily at 18:30"

# Check and download model
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
    echo "  安装完成后运行: s2r start"
    echo "============================================"
  else
    echo "[INFO] 本地模型已存在: ${MODEL_DIR}"
    echo ""
    echo "[INFO] 正在启动本地模型服务..."
    cd "${INSTALL_DIR}" && "${BIN_DIR}/s2r" start
  fi
fi

echo ""
echo "[OK] 安装完成!"
echo ""
echo "[INFO] 安装目录: ${INSTALL_DIR}"
echo "[INFO] 二进制文件: ${BIN_DIR}/s2r"
echo ""
echo "使用说明:"
echo "  s2r start   # 启动模型服务"
echo "  s2r stop    # 停止模型服务"
echo "  s2r status  # 查看服务状态"
echo "  s2r capture # 手动截图分析"
echo "  s2r report  # 生成日报"
echo ""

# Ensure install bin is on user's PATH
USER_BIN_PATH="${BIN_DIR}"
add_path_to_profile() {
  shell_name="$(basename "${SHELL:-/bin/bash}")"
  if [[ "${shell_name}" == "zsh" ]]; then
    profile_file="${HOME}/.zprofile"
  else
    profile_file="${HOME}/.bash_profile"
  fi

  if ! grep -F "${USER_BIN_PATH}" "${profile_file}" >/dev/null 2>&1; then
    echo "[INFO] adding ${USER_BIN_PATH} to PATH in ${profile_file}"
    mkdir -p "$(dirname "${profile_file}")"
    cat >> "${profile_file}" <<EOF
# Added by screen2report installer
if [ -d "${USER_BIN_PATH}" ]; then
  export PATH="${USER_BIN_PATH}:\$PATH"
fi
EOF
    echo "[OK] updated ${profile_file}. Restart your shell or run: source ${profile_file}"
  else
    echo "[INFO] ${USER_BIN_PATH} already on PATH in ${profile_file}"
  fi
}

add_path_to_profile
