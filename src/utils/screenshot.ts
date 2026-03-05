import { URL } from 'url';
import { fileURLToPath } from 'url';
import { run } from './shell.js';
import { get } from '../core/env.js';

// macOS-specific screen recording permission check
// Uses CoreGraphics via a helper or screencapture
export function hasScreenRecordingPermission(): boolean | null {
  // Node.js cannot directly access CGPreflightScreenCaptureAccess
  // We'll rely on screencapture to fail if no permission
  return null; // Unknown, let the actual capture tell us
}

export function isRunningUnderLaunchd(): boolean {
  return process.env['XPC_SERVICE_NAME'] !== undefined || !process.stdin.isTTY;
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
): Promise<boolean> {
  const args = ['-x', '-t', 'png'];
  if (displayIndex !== undefined) {
    args.push('-D', displayIndex.toString());
  }
  args.push(fileURLToPath(outputPath));

  try {
    const result = await run('/usr/sbin/screencapture', args);
    return result.exitCode === 0;
  } catch {
    return false;
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
    if (await captureDisplay(path, idx)) {
      results.push(path);
    }
  }

  if (results.length > 0) {
    return results;
  }

  // Fallback: capture without display index
  const fallback = new URL(`${timeString}.png`, screenshotDir);
  if (!(await captureDisplay(fallback))) {
    throw new Error('Screenshot failed');
  }

  return [fallback];
}
