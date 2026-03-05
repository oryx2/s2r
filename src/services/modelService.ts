import { URL } from 'url';
import { mkdir, rename, unlink, stat, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { run } from '../utils/shell.js';

export type ServerState =
  | { type: 'stopped' }
  | { type: 'starting' }
  | { type: 'running'; pid: number }
  | { type: 'error'; message: string };

export type ModelDownloadSource = 'ModelScope' | 'HuggingFace';

export interface DownloadProgress {
  fileName: string;
  current: number;
  total: number;
  filePercent: number | null;
}

export async function healthCheck(baseURL: string = 'http://127.0.0.1:18279/v1'): Promise<string> {
  const response = await fetch(`${baseURL}/models`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.text();
}

export async function downloadWithCurl(
  url: string,
  destination: string,
  authHeader?: string
): Promise<void> {
  const args = [
    '--fail', '--location', '--retry', '3', '--retry-delay', '2',
    '--output', destination, '--continue-at', '-'
  ];
  if (authHeader) {
    args.push('-H', authHeader);
  }
  args.push(url);

  const result = await run('/usr/bin/curl', args);
  if (result.exitCode !== 0) {
    throw new Error(`curl failed: ${result.stderr}`);
  }
}

export async function downloadGGUF(
  modelName: string,
  ggufFileName: string,
  modelsDir: URL,
  onProgress?: (message: string) => void
): Promise<URL> {
  const targetDir = new URL(`${modelName}/`, modelsDir);
  await mkdir(fileURLToPath(targetDir), { recursive: true });

  const destination = new URL(ggufFileName, targetDir);

  try {
    const stats = await stat(fileURLToPath(destination));
    if (stats.size > 100_000_000) {
      onProgress?.(`Model already exists: ${fileURLToPath(destination)}`);
      return targetDir;
    }
  } catch {
    // File doesn't exist, proceed with download
  }

  const partial = new URL(`${ggufFileName}.part`, targetDir);

  const encodedModel = encodeURIComponent(modelName);
  const encodedFile = encodeURIComponent(ggufFileName);

  const urls = [
    `https://modelscope.cn/models/${encodedModel}/resolve/master/${encodedFile}`,
    `https://www.modelscope.cn/models/${encodedModel}/resolve/master/${encodedFile}`,
    `https://huggingface.co/${encodedModel}/resolve/main/${encodedFile}?download=true`
  ];

  for (const urlString of urls) {
    onProgress?.(`Downloading from ${new URL(urlString).hostname}...`);
    try {
      await downloadWithCurl(urlString, fileURLToPath(partial));
      await rename(fileURLToPath(partial), fileURLToPath(destination));
      onProgress?.(`Download completed: ${ggufFileName}`);
      return targetDir;
    } catch (error) {
      onProgress?.(`Failed from ${new URL(urlString).hostname}: ${error}`);
      try { await unlink(fileURLToPath(partial)); } catch { /* ignore */ }
    }
  }

  throw new Error('Failed to download model from all sources');
}

export async function downloadMultimodalModel(
  modelName: string,
  ggufFileName: string,
  mmprojFileName: string,
  modelsDir: URL,
  onProgress?: (message: string) => void
): Promise<URL> {
  const targetDir = new URL(`${modelName}/`, modelsDir);
  await mkdir(fileURLToPath(targetDir), { recursive: true });

  // Download main GGUF model
  const ggufDestination = new URL(ggufFileName, targetDir);
  const ggufPartial = new URL(`${ggufFileName}.part`, targetDir);

  let ggufValid = false;
  try {
    const stats = await stat(fileURLToPath(ggufDestination));
    ggufValid = stats.size > 100_000_000;
  } catch { /* ignore */ }

  if (!ggufValid) {
    onProgress?.(`Downloading model: ${ggufFileName}...`);

    const encodedModel = encodeURIComponent(modelName);
    const encodedFile = encodeURIComponent(ggufFileName);

    const urls = [
      `https://modelscope.cn/models/${encodedModel}/resolve/master/${encodedFile}`,
      `https://www.modelscope.cn/models/${encodedModel}/resolve/master/${encodedFile}`,
      `https://huggingface.co/${encodedModel}/resolve/main/${encodedFile}?download=true`
    ];

    let downloaded = false;
    for (const urlString of urls) {
      onProgress?.(`  Trying ${new URL(urlString).hostname}...`);
      try {
        await downloadWithCurl(urlString, fileURLToPath(ggufPartial));
        await rename(fileURLToPath(ggufPartial), fileURLToPath(ggufDestination));
        onProgress?.('  ✓ Model downloaded');
        downloaded = true;
        break;
      } catch (error) {
        onProgress?.(`  ✗ Failed: ${error}`);
        try { await unlink(fileURLToPath(ggufPartial)); } catch { /* ignore */ }
      }
    }

    if (!downloaded) {
      throw new Error('Failed to download model from all sources');
    }
  } else {
    onProgress?.(`Model already exists: ${ggufFileName}`);
  }

  // Download mmproj file
  const mmprojDestination = new URL(mmprojFileName, targetDir);
  const mmprojPartial = new URL(`${mmprojFileName}.part`, targetDir);

  let mmprojValid = false;
  try {
    const stats = await stat(fileURLToPath(mmprojDestination));
    mmprojValid = stats.size > 10_000_000;
  } catch { /* ignore */ }

  if (!mmprojValid) {
    onProgress?.(`Downloading vision projector: ${mmprojFileName}...`);

    const encodedModel = encodeURIComponent(modelName);
    const encodedFile = encodeURIComponent(mmprojFileName);

    const urls = [
      `https://modelscope.cn/models/${encodedModel}/resolve/master/${encodedFile}`,
      `https://www.modelscope.cn/models/${encodedModel}/resolve/master/${encodedFile}`,
      `https://huggingface.co/${encodedModel}/resolve/main/${encodedFile}?download=true`
    ];

    let downloaded = false;
    for (const urlString of urls) {
      onProgress?.(`  Trying ${new URL(urlString).hostname}...`);
      try {
        await downloadWithCurl(urlString, fileURLToPath(mmprojPartial));
        await rename(fileURLToPath(mmprojPartial), fileURLToPath(mmprojDestination));
        onProgress?.('  ✓ Vision projector downloaded');
        downloaded = true;
        break;
      } catch (error) {
        onProgress?.(`  ✗ Failed: ${error}`);
        try { await unlink(fileURLToPath(mmprojPartial)); } catch { /* ignore */ }
      }
    }

    if (!downloaded) {
      onProgress?.('[WARN] Failed to download vision projector. Model will work for text only.');
    }
  } else {
    onProgress?.(`Vision projector already exists: ${mmprojFileName}`);
  }

  return targetDir;
}

export async function findModelPath(modelsDir: URL): Promise<URL | null> {
  try {
    const entries = await readdir(fileURLToPath(modelsDir), { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const modelDir = new URL(`${entry.name}/`, modelsDir);
      const files = await readdir(fileURLToPath(modelDir));

      if (files.some(f => f.endsWith('.gguf'))) {
        return modelDir;
      }
      if (files.some(f => f.endsWith('.safetensors') && !f.endsWith('.part'))) {
        return modelDir;
      }
    }
  } catch {
    // Directory doesn't exist or is empty
  }

  return null;
}

export async function startLlamaServer(
  modelPath: URL,
  llamaBinary: URL,
  options: {
    modelName?: string;
    host?: string;
    port?: string;
    mmprojPath?: string;
    logFile?: string;
    pidFile?: string;
  } = {}
): Promise<number> {
  const {
    modelName = 'local-model',
    host = '127.0.0.1',
    port = '18279',
    mmprojPath,
  } = options;

  const args = [
    '--host', host,
    '--port', port,
    '--model', fileURLToPath(modelPath),
    '--alias', modelName,
  ];

  if (mmprojPath) {
    args.push('--mmproj', mmprojPath);
  }

  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const process = spawn(fileURLToPath(llamaBinary), args, {
      detached: true,
      stdio: 'ignore',
    });

    process.on('spawn', () => {
      resolve(process.pid!);
    });

    process.on('error', (err: Error) => {
      reject(err);
    });
  });
}
