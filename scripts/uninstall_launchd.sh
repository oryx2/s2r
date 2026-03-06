#!/usr/bin/env bash
set -euo pipefail

CAPTURE_LABEL="com.screen2report.capture"
REPORT_LABEL="com.screen2report.report"
LEGACY_CAPTURE_LABEL="com.selfrecord.capture"
LEGACY_REPORT_LABEL="com.selfrecord.report"
LAUNCHD_DIR="${HOME}/Library/LaunchAgents"

launchctl bootout "gui/$(id -u)/${CAPTURE_LABEL}" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/${REPORT_LABEL}" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/${LEGACY_CAPTURE_LABEL}" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/${LEGACY_REPORT_LABEL}" 2>/dev/null || true

rm -f "${LAUNCHD_DIR}/${CAPTURE_LABEL}.plist"
rm -f "${LAUNCHD_DIR}/${REPORT_LABEL}.plist"
rm -f "${LAUNCHD_DIR}/${LEGACY_CAPTURE_LABEL}.plist"
rm -f "${LAUNCHD_DIR}/${LEGACY_REPORT_LABEL}.plist"

echo "[OK] launchd jobs removed"
