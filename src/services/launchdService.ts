import { URL } from 'url';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { access } from 'fs/promises';
import { run } from '../utils/shell.js';

export const CAPTURE_LABEL = 'com.screen2report.capture';
export const REPORT_LABEL = 'com.screen2report.report';
export const LEGACY_CAPTURE_LABEL = 'com.selfrecord.capture';
export const LEGACY_REPORT_LABEL = 'com.selfrecord.report';

export interface LaunchdOptions {
  baseDir: URL;
  captureBinary: URL;
  reportBinary: URL;
  captureArguments?: string[];
  reportArguments?: string[];
  reportHour: number;
  reportMinute: number;
}

export interface LaunchdStatus {
  capture: boolean;
  report: boolean;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function isInstalled(): Promise<LaunchdStatus> {
  const launchAgentsDir = `${process.env.HOME}/Library/LaunchAgents`;
  const capture = await fileExists(`${launchAgentsDir}/${CAPTURE_LABEL}.plist`);
  const report = await fileExists(`${launchAgentsDir}/${REPORT_LABEL}.plist`);
  return { capture, report };
}

async function bootout(label: string, uid: string): Promise<void> {
  const result = await run('/bin/launchctl', ['bootout', `gui/${uid}/${label}`]);
  // Ignore "not found" errors during cleanup
  if (result.exitCode !== 0) {
    const text = (result.stderr + result.stdout).toLowerCase();
    if (!(text.includes('could not find service') || text.includes('not found'))) {
      throw new Error(`launchctl bootout failed for ${label}: ${result.stderr}`);
    }
  }
}

async function runLaunchctl(args: string[], context: string): Promise<void> {
  const result = await run('/bin/launchctl', args);
  if (result.exitCode !== 0) {
    const msg = result.stderr || result.stdout;
    throw new Error(`launchctl failed (${context}): ${msg}`);
  }
}

function capturePlistXML(options: LaunchdOptions, logsDir: URL): string {
  const captureArgs = options.captureArguments ?? [];
  const captureArgsBlock = captureArgs.map(arg => `              <string>${arg}</string>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${CAPTURE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${options.captureBinary.pathname}</string>
${captureArgsBlock ? captureArgsBlock + '\n' : ''}              <string>--base-dir</string>
      <string>${options.baseDir.pathname}</string>
    </array>
    <key>StartInterval</key>
    <integer>300</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>WorkingDirectory</key>
    <string>${options.baseDir.pathname}</string>
    <key>StandardOutPath</key>
    <string>${logsDir.pathname}capture.out.log</string>
    <key>StandardErrorPath</key>
    <string>${logsDir.pathname}capture.err.log</string>
  </dict>
</plist>`;
}

function reportPlistXML(options: LaunchdOptions, logsDir: URL): string {
  const reportArgs = options.reportArguments ?? [];
  const reportArgsBlock = reportArgs.map(arg => `              <string>${arg}</string>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${REPORT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${options.reportBinary.pathname}</string>
${reportArgsBlock ? reportArgsBlock + '\n' : ''}              <string>--base-dir</string>
      <string>${options.baseDir.pathname}</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
      <key>Hour</key>
      <integer>${options.reportHour}</integer>
      <key>Minute</key>
      <integer>${options.reportMinute}</integer>
    </dict>
    <key>RunAtLoad</key>
    <false/>
    <key>WorkingDirectory</key>
    <string>${options.baseDir.pathname}</string>
    <key>StandardOutPath</key>
    <string>${logsDir.pathname}report.out.log</string>
    <key>StandardErrorPath</key>
    <string>${logsDir.pathname}report.err.log</string>
  </dict>
</plist>`;
}

export async function install(options: LaunchdOptions): Promise<void> {
  const launchAgentsDir = `${process.env.HOME}/Library/LaunchAgents`;
  const logsDir = new URL('logs/', options.baseDir);

  await mkdir(launchAgentsDir, { recursive: true });
  await mkdir(logsDir.pathname, { recursive: true });

  const capturePlist = `${launchAgentsDir}/${CAPTURE_LABEL}.plist`;
  const reportPlist = `${launchAgentsDir}/${REPORT_LABEL}.plist`;

  await writeFile(capturePlist, capturePlistXML(options, logsDir));
  await writeFile(reportPlist, reportPlistXML(options, logsDir));

  const uid = String(process.getuid?.() ?? 501);

  // Boot out any existing services (including legacy)
  await bootout(CAPTURE_LABEL, uid).catch(() => {});
  await bootout(REPORT_LABEL, uid).catch(() => {});
  await bootout(LEGACY_CAPTURE_LABEL, uid).catch(() => {});
  await bootout(LEGACY_REPORT_LABEL, uid).catch(() => {});

  // Bootstrap new services
  await runLaunchctl(['bootstrap', `gui/${uid}`, capturePlist], CAPTURE_LABEL);
  await runLaunchctl(['bootstrap', `gui/${uid}`, reportPlist], REPORT_LABEL);
  await runLaunchctl(['enable', `gui/${uid}/${CAPTURE_LABEL}`], CAPTURE_LABEL);
  await runLaunchctl(['enable', `gui/${uid}/${REPORT_LABEL}`], REPORT_LABEL);
}

export async function uninstall(): Promise<void> {
  const launchAgentsDir = `${process.env.HOME}/Library/LaunchAgents`;
  const uid = String(process.getuid?.() ?? 501);

  await bootout(CAPTURE_LABEL, uid).catch(() => {});
  await bootout(REPORT_LABEL, uid).catch(() => {});
  await bootout(LEGACY_CAPTURE_LABEL, uid).catch(() => {});
  await bootout(LEGACY_REPORT_LABEL, uid).catch(() => {});

  const labels = [CAPTURE_LABEL, REPORT_LABEL, LEGACY_CAPTURE_LABEL, LEGACY_REPORT_LABEL];
  for (const label of labels) {
    try {
      await unlink(`${launchAgentsDir}/${label}.plist`);
    } catch { /* ignore */ }
  }
}
