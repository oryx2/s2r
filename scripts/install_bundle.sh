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

# Install launchd services for scheduled capture and report
echo "[INFO] installing scheduled tasks..."
LAUNCHD_DIR="${HOME}/Library/LaunchAgents"
mkdir -p "${LAUNCHD_DIR}"

CAPTURE_LABEL="com.screen2report.capture"
REPORT_LABEL="com.screen2report.report"

# Create capture plist
cat > "${LAUNCHD_DIR}/${CAPTURE_LABEL}.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${CAPTURE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${BASE_DIR}/bin/s2r</string>
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
    <string>${BASE_DIR}/logs/capture.out.log</string>
    <key>StandardErrorPath</key>
    <string>${BASE_DIR}/logs/capture.err.log</string>
  </dict>
</plist>
EOF

# Create report plist
cat > "${LAUNCHD_DIR}/${REPORT_LABEL}.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${REPORT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${BASE_DIR}/bin/s2r</string>
      <string>report</string>
      <string>--base-dir</string>
      <string>${BASE_DIR}</string>
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
    <string>${BASE_DIR}</string>
    <key>StandardOutPath</key>
    <string>${BASE_DIR}/logs/report.out.log</string>
    <key>StandardErrorPath</key>
    <string>${BASE_DIR}/logs/report.err.log</string>
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

echo "[OK] setup complete"
echo "[INFO] binary: ${BASE_DIR}/bin/s2r"
echo "[INFO] usage: s2r {status|setup|capture|report|uninstall}"
