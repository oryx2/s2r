#!/usr/bin/env node
import { Command } from 'commander';
import { URL } from 'url';
import { mkdir, access, readFile, unlink, writeFile } from 'fs/promises';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

import { runCapture } from './services/captureService.js';
import { generateReport } from './services/reportService.js';
import { downloadMultimodalModel, findModelPath, startLlamaServer, healthCheck } from './services/modelService.js';
import { install as installLaunchd, uninstall as uninstallLaunchd, isInstalled } from './services/launchdService.js';

const program = new Command();

function getBaseDir(): URL {
  return new URL('.screen-report/', `file://${homedir()}/`);
}

function getPIDFile(): URL {
  return new URL('run/model_server.pid', getBaseDir());
}

function getLogFile(): URL {
  return new URL('logs/model_server.log', getBaseDir());
}

async function isProcessRunning(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readPID(): Promise<number | null> {
  try {
    const pidFile = getPIDFile();
    const data = await readFile(fileURLToPath(pidFile), 'utf-8');
    const pid = parseInt(data.trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

async function writePID(pid: number): Promise<void> {
  const pidFile = getPIDFile();
  const pidDir = fileURLToPath(new URL('run/', getBaseDir()));
  await mkdir(pidDir, { recursive: true });
  await writeFile(fileURLToPath(pidFile), String(pid));
}

async function removePID(): Promise<void> {
  try {
    await unlink(fileURLToPath(getPIDFile()));
  } catch { /* ignore */ }
}

async function ensureLlamaServer(baseDir: URL): Promise<URL> {
  // Prefer bundled runtime
  const bundled = new URL('runtime/llama-server', baseDir);
  try {
    await access(fileURLToPath(bundled));
    return bundled;
  } catch { /* ignore */ }

  // Try system PATH
  try {
    const { stdout } = await import('./utils/shell.js').then(m => m.run('/usr/bin/which', ['llama-server']));
    if (stdout) {
      return new URL(`file://${stdout.trim()}`);
    }
  } catch { /* ignore */ }

  throw new Error(`llama-server not found. Please install llama.cpp or put llama-server at ${fileURLToPath(baseDir)}runtime/llama-server`);
}

async function getModelPath(baseDir: URL, onProgress?: (msg: string) => void): Promise<URL> {
  const modelsDir = new URL('models/', baseDir);
  await mkdir(fileURLToPath(modelsDir), { recursive: true });

  const existing = await findModelPath(modelsDir);
  if (existing) {
    return existing;
  }

  onProgress?.('Model not found. Auto-downloading Qwen3.5-0.8B (multimodal)...');
  return downloadMultimodalModel(
    'unsloth/Qwen3.5-0.8B-GGUF',
    'Qwen3.5-0.8B-Q4_K_M.gguf',
    'mmproj-F32.gguf',
    modelsDir,
    onProgress
  );
}

program
  .name('s2r')
  .description('Screen2Report - 本地模型服务管理工具')
  .version('0.2.0');

program
  .command('start')
  .description('Start the model server')
  .action(async () => {
    try {
      const baseDir = getBaseDir();

      // Check if already running
      const existingPid = await readPID();
      if (existingPid && await isProcessRunning(existingPid)) {
        console.log(`[INFO] Model server already running (PID: ${existingPid})`);
        return;
      }

      // Ensure directories
      const logDir = fileURLToPath(new URL('logs/', getBaseDir()));
      await mkdir(logDir, { recursive: true });

      // Get model and binary
      const modelPath = await getModelPath(baseDir, msg => console.log(`[INFO] ${msg}`));
      const llamaBinary = await ensureLlamaServer(baseDir);
      const pathParts = fileURLToPath(modelPath).split('/').filter(Boolean);
      const modelName = pathParts[pathParts.length - 1] || 'local-model';

      console.log('[INFO] Starting model server...');
      console.log(`[INFO] Model: ${modelName}`);
      console.log(`[INFO] Log: ${fileURLToPath(getLogFile())}`);

      // Find model files
      const { readdir } = await import('fs/promises');
      const files = await readdir(fileURLToPath(modelPath));
      const validFiles = files.filter(f => !f.endsWith('.part') && !f.endsWith('.tmp'));

      const modelFile = validFiles.find(f => f.endsWith('.gguf') && !f.includes('mmproj'))
        || validFiles.find(f => f.endsWith('.gguf'));
      const mmprojFile = validFiles.find(f => f.endsWith('.gguf') && f.includes('mmproj'));

      if (!modelFile) {
        throw new Error(`No model file found in ${fileURLToPath(modelPath)}`);
      }

      const modelFilePath = new URL(modelFile, modelPath);
      const mmprojPath = mmprojFile ? fileURLToPath(new URL(mmprojFile, modelPath)) : undefined;

      // Start server
      const pid = await startLlamaServer(
        modelFilePath,
        llamaBinary,
        { modelName, mmprojPath }
      );

      await writePID(pid);

      // Wait and verify
      await new Promise(r => setTimeout(r, 1000));

      if (await isProcessRunning(pid)) {
        console.log(`[OK] Model server started (PID: ${pid})`);
        console.log('[INFO] API: http://127.0.0.1:18279/v1');
      } else {
        console.error('[ERROR] Failed to start model server');
        process.exit(1);
      }

      // Install launchd if needed
      const binaryPath = new URL('bin/s2r', baseDir);
      const currentStatus = await isInstalled();

      if (!currentStatus.capture || !currentStatus.report) {
        console.log('');
        console.log('[INFO] Installing scheduled tasks...');
        try {
          await installLaunchd({
            baseDir,
            captureBinary: binaryPath,
            reportBinary: binaryPath,
            captureArguments: ['capture'],
            reportArguments: ['report'],
            reportHour: 18,
            reportMinute: 30,
          });
          console.log('[OK] Scheduled tasks installed');
          console.log('[INFO] Capture: every 5 minutes');
          console.log('[INFO] Report: daily at 18:30');
        } catch (e) {
          console.warn(`[WARN] Failed to install scheduled tasks: ${e}`);
        }
      }

      // Auto-run capture after start
      console.log('');
      await runCapture({ baseDir, onProgress: msg => console.log(`[INFO] ${msg}`) });
    } catch (error) {
      console.error(`[ERROR] ${error}`);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the model server')
  .action(async () => {
    try {
      const pid = await readPID();
      if (!pid || !(await isProcessRunning(pid))) {
        console.log('[INFO] No model server running');
        await removePID();
        return;
      }

      console.log(`[INFO] Stopping model server (PID: ${pid})...`);
      process.kill(pid, 'SIGTERM');

      // Wait for exit
      let attempts = 0;
      while (await isProcessRunning(pid) && attempts < 10) {
        await new Promise(r => setTimeout(r, 500));
        attempts++;
      }

      if (await isProcessRunning(pid)) {
        console.log('[WARN] Server didn\'t stop gracefully, force killing...');
        process.kill(pid, 'SIGKILL');
      }

      await removePID();
      console.log('[OK] Model server stopped');
    } catch (error) {
      console.error(`[ERROR] ${error}`);
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check model server status')
  .action(async () => {
    try {
      const pid = await readPID();

      if (!pid || !(await isProcessRunning(pid))) {
        console.log('[INFO] Model server: stopped');
        const status = await isInstalled();
        console.log('');
        console.log('[INFO] Scheduled tasks:');
        console.log(`[INFO]   Capture: ${status.capture ? 'enabled (every 5 min)' : 'disabled'}`);
        console.log(`[INFO]   Report:  ${status.report ? 'enabled (daily 18:30)' : 'disabled'}`);
        return;
      }

      console.log(`[INFO] Model server: running (PID: ${pid})`);

      // Health check
      try {
        await healthCheck();
        console.log('[OK] Health check: ready');
        console.log('[INFO] API: http://127.0.0.1:18279/v1');
      } catch {
        console.log('[WARN] Health check: not ready yet');
      }

      const status = await isInstalled();
      console.log('');
      console.log('[INFO] Scheduled tasks:');
      console.log(`[INFO]   Capture: ${status.capture ? 'enabled (every 5 min)' : 'disabled'}`);
      console.log(`[INFO]   Report:  ${status.report ? 'enabled (daily 18:30)' : 'disabled'}`);
    } catch (error) {
      console.error(`[ERROR] ${error}`);
      process.exit(1);
    }
  });

program
  .command('capture')
  .description('Capture screenshot and analyze')
  .option('--base-dir <path>', 'Base directory')
  .option('--dry-run', 'Skip LLM analysis')
  .action(async (options) => {
    try {
      const baseDir = options.baseDir ? new URL(`file://${options.baseDir}`) : getBaseDir();
      console.log('[INFO] Starting capture...');
      console.log(`[INFO] Base directory: ${fileURLToPath(baseDir)}`);

      const result = await runCapture({
        baseDir,
        dryRun: options.dryRun,
        onProgress: msg => console.log(`[INFO] ${msg}`),
      });

      console.log('[OK] Capture completed');
      console.log(`[INFO] Screenshots: ${result.screenshotPaths.length} files`);
      console.log(`[INFO] Analysis: ${result.analysisFile}`);
    } catch (error) {
      console.error(`[ERROR] ${error}`);
      process.exit(1);
    }
  });

program
  .command('report')
  .description('Generate daily report')
  .option('--base-dir <path>', 'Base directory')
  .option('--date <date>', 'Date (YYYY-MM-DD)')
  .option('--dry-run', 'Generate fallback report without LLM')
  .action(async (options) => {
    try {
      const baseDir = options.baseDir ? new URL(`file://${options.baseDir}`) : getBaseDir();
      console.log('[INFO] Generating report...');
      console.log(`[INFO] Base directory: ${fileURLToPath(baseDir)}`);
      if (options.date) {
        console.log(`[INFO] Date: ${options.date}`);
      }

      const result = await generateReport({
        baseDir,
        dateString: options.date,
        dryRun: options.dryRun,
        onProgress: msg => console.log(`[INFO] ${msg}`),
      });

      console.log(`[OK] Report generated: ${result.reportFile}`);
      console.log(`[INFO] Records processed: ${result.recordCount}`);
    } catch (error) {
      console.error(`[ERROR] ${error}`);
      process.exit(1);
    }
  });

program
  .command('uninstall')
  .description('Uninstall launchd services')
  .action(async () => {
    try {
      await uninstallLaunchd();
      console.log('[OK] Launchd services uninstalled');
    } catch (error) {
      console.error(`[ERROR] ${error}`);
      process.exit(1);
    }
  });

program.parse();
