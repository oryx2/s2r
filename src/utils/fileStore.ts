import { mkdir, appendFile, writeFile, readFile, access } from 'fs/promises';
import { fileURLToPath, URL } from 'url';

export interface CaptureDirs {
  screenshots: URL;
  analysisDir: URL;
}

export async function ensureCaptureDirs(baseDir: URL, date: string): Promise<CaptureDirs> {
  const screenshots = new URL(`data/screenshots/${date}/`, baseDir);
  const analysis = new URL('data/analysis/', baseDir);

  await mkdir(fileURLToPath(screenshots), { recursive: true });
  await mkdir(fileURLToPath(analysis), { recursive: true });

  return { screenshots, analysisDir: analysis };
}

export async function appendJSONL<T>(value: T, fileURL: URL): Promise<void> {
  const line = JSON.stringify(value) + '\n';
  const filePath = fileURLToPath(fileURL);

  try {
    await access(filePath);
    await appendFile(filePath, line);
  } catch {
    await writeFile(filePath, line);
  }
}

export async function readLines(fileURL: URL): Promise<string[]> {
  try {
    const content = await readFile(fileURLToPath(fileURL), 'utf-8');
    return content.split('\n').filter(line => line.trim());
  } catch {
    return [];
  }
}

export async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function isExecutable(path: string): Promise<boolean> {
  try {
    const { statSync } = await import('fs');
    const stats = statSync(path);
    // Check if file is executable by owner (0o100)
    return stats.isFile() && (stats.mode & 0o100) !== 0;
  } catch {
    return false;
  }
}

export function pathFromURL(url: URL): string {
  return fileURLToPath(url);
}
