#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LAUNCHD_DIR="${HOME}/Library/LaunchAgents"
TMP_DIR="${BASE_DIR}/launchd"
LOG_DIR="${BASE_DIR}/logs"

CAPTURE_BIN="${CAPTURE_BIN:-${BASE_DIR}/bin/s2r}"
REPORT_BIN="${REPORT_BIN:-${BASE_DIR}/bin/s2r}"

CAPTURE_LABEL="com.screen2report.capture"
REPORT_LABEL="com.screen2report.report"
LEGACY_CAPTURE_LABEL="com.selfrecord.capture"
LEGACY_REPORT_LABEL="com.selfrecord.report"

REPORT_HOUR="${REPORT_HOUR:-18}"
REPORT_MINUTE="${REPORT_MINUTE:-30}"

mkdir -p "${TMP_DIR}" "${LOG_DIR}" "${LAUNCHD_DIR}"

if [[ ! -x "${CAPTURE_BIN}" ]]; then
  echo "[ERROR] capture binary not found: ${CAPTURE_BIN}" >&2
  exit 1
fi
if [[ ! -x "${REPORT_BIN}" ]]; then
  echo "[ERROR] report binary not found: ${REPORT_BIN}" >&2
  exit 1
fi

CAPTURE_PLIST="${TMP_DIR}/${CAPTURE_LABEL}.plist"
REPORT_PLIST="${TMP_DIR}/${REPORT_LABEL}.plist"

cat >"${CAPTURE_PLIST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${CAPTURE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${CAPTURE_BIN}</string>
      <string>capture</string>
      <string>--base-dir</string>
      <string>${BASE_DIR}</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${BASE_DIR}</string>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/capture.out.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/capture.err.log</string>
  </dict>
</plist>
EOF

cat >"${REPORT_PLIST}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${REPORT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${REPORT_BIN}</string>
      <string>report</string>
      <string>--base-dir</string>
      <string>${BASE_DIR}</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>
      <integer>${REPORT_HOUR}</integer>
      <key>Minute</key>
      <integer>${REPORT_MINUTE}</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>WorkingDirectory</key>
    <string>${BASE_DIR}</string>
    <key>StandardOutPath</key>
    <string>${LOG_DIR}/report.out.log</string>
    <key>StandardErrorPath</key>
    <string>${LOG_DIR}/report.err.log</string>
  </dict>
</plist>
EOF

cp "${CAPTURE_PLIST}" "${LAUNCHD_DIR}/${CAPTURE_LABEL}.plist"
cp "${REPORT_PLIST}" "${LAUNCHD_DIR}/${REPORT_LABEL}.plist"

launchctl bootout "gui/$(id -u)/${CAPTURE_LABEL}" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/${REPORT_LABEL}" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/${LEGACY_CAPTURE_LABEL}" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/${LEGACY_REPORT_LABEL}" 2>/dev/null || true

launchctl bootstrap "gui/$(id -u)" "${LAUNCHD_DIR}/${CAPTURE_LABEL}.plist"
launchctl bootstrap "gui/$(id -u)" "${LAUNCHD_DIR}/${REPORT_LABEL}.plist"
launchctl enable "gui/$(id -u)/${CAPTURE_LABEL}"
launchctl enable "gui/$(id -u)/${REPORT_LABEL}"

echo "[OK] Installed ${CAPTURE_LABEL} (every 5 minutes)"
echo "[OK] Installed ${REPORT_LABEL} (daily at ${REPORT_HOUR}:${REPORT_MINUTE})"
echo "[INFO] Capture bin: ${CAPTURE_BIN}"
echo "[INFO] Report  bin: ${REPORT_BIN}"
