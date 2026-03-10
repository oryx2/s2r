import { spawnSync } from 'child_process';
import { URL } from 'url';
import { fileURLToPath } from 'url';
import { run } from './shell.js';
import { get } from '../core/env.js';

export interface CaptureDisplayResult {
  ok: boolean;
  permissionDenied: boolean;
}

// macOS-specific screen recording permission checks via CoreGraphics.
// We shell out to Swift because Node.js cannot call these APIs directly.
export function hasScreenRecordingPermission(): boolean | null {
  return runPermissionCheck('CGPreflightScreenCaptureAccess()');
}

export function requestScreenRecordingPermission(): boolean | null {
  return runPermissionCheck('CGRequestScreenCaptureAccess()');
}

export function isRunningUnderLaunchd(): boolean {
  return process.env['XPC_SERVICE_NAME'] !== undefined || !process.stdin.isTTY;
}

export function buildPermissionHelpMessage(background: boolean): string {
  const suffix = background
    ? '当前运行在后台任务中，不会自动弹出授权请求。请先在前台终端里手动运行一次 `s2r capture` 完成授权。'
    : '请在“系统设置 > 隐私与安全性 > 屏幕与系统音频录制”中允许当前终端/应用，然后重新运行。';
  return `Screen recording permission is required. ${suffix}`;
}

export function parseDisplayIndices(): number[] | null {
  const raw = get('SCREENSHOT_DISPLAYS')?.trim() ?? '';
  if (!raw) return null;

  const values = raw
    .split(',')
    .map((s: string) => parseInt(s.trim(), 10))
    .filter((n: number) => !isNaN(n) && n > 0);

  const uniqueSorted = [...new Set(values)].sort((a: number, b: number) => a - b);
  return uniqueSorted.length > 0 ? uniqueSorted : null;
}

export async function captureDisplay(
  outputPath: URL,
  displayIndex?: number
): Promise<CaptureDisplayResult> {
  const args = ['-x', '-t', 'png'];
  if (displayIndex !== undefined) {
    args.push('-D', displayIndex.toString());
  }
  args.push(fileURLToPath(outputPath));

  try {
    const result = await run('/usr/sbin/screencapture', args);
    const errorText = `${result.stderr}\n${result.stdout}`.toLowerCase();
    return {
      ok: result.exitCode === 0,
      permissionDenied: isScreenRecordingPermissionError(errorText),
    };
  } catch {
    return {
      ok: false,
      permissionDenied: false,
    };
  }
}

export async function captureScreenshots(
  screenshotDir: URL,
  timeString: string
): Promise<URL[]> {
  const maxDisplaysSetting = get('SCREENSHOT_MAX_DISPLAYS', '6') ?? '6';
  const maxDisplays = Math.max(1, Math.min(parseInt(maxDisplaysSetting, 10) || 6, 16));
  const displayIndices = parseDisplayIndices() ?? Array.from({ length: maxDisplays }, (_, i) => i + 1);

  const results: URL[] = [];

  for (const idx of displayIndices) {
    const path = new URL(`${timeString}_d${idx}.png`, screenshotDir);
    const result = await captureDisplay(path, idx);
    if (result.ok) {
      results.push(path);
      continue;
    }
    if (result.permissionDenied) {
      throw new Error(buildPermissionHelpMessage(isRunningUnderLaunchd()));
    }
  }

  if (results.length > 0) {
    return results;
  }

  // Fallback: capture without display index
  const fallback = new URL(`${timeString}.png`, screenshotDir);
  const result = await captureDisplay(fallback);
  if (!result.ok) {
    if (result.permissionDenied) {
      throw new Error(buildPermissionHelpMessage(isRunningUnderLaunchd()));
    }
    throw new Error('Screenshot failed');
  }

  return [fallback];
}

function runPermissionCheck(expression: string): boolean | null {
  const tmpDir = process.env['TMPDIR'] ?? '/tmp';
  const result = spawnSync(
    '/usr/bin/env',
    [
      'CLANG_MODULE_CACHE_PATH=/tmp/s2r-swift-module-cache',
      '/usr/bin/swift',
      '-e',
      `import CoreGraphics; print(${expression})`,
    ],
    {
      encoding: 'utf-8',
      env: {
        ...process.env,
        TMPDIR: tmpDir,
      },
    }
  );

  if (result.status !== 0) {
    return null;
  }

  const output = (result.stdout ?? '').trim().toLowerCase();
  if (output === 'true') return true;
  if (output === 'false') return false;
  return null;
}

function isScreenRecordingPermissionError(text: string): boolean {
  return [
    'screen recording',
    'not authorized',
    'not permitted',
    'permission denied',
    'operation not permitted',
    'kcgerrornotauthorized',
  ].some(pattern => text.includes(pattern));
}
