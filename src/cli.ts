#!/usr/bin/env node
import { Command } from 'commander';
import { URL } from 'url';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

import { runCapture } from './services/captureService';
import { generateReport } from './services/reportService';
import { install as installLaunchd, uninstall as uninstallLaunchd, isInstalled } from './services/launchdService';
import { resolveBaseURL } from './services/openaiCompat.js';
import { get } from './core/env.js';

const program = new Command();

function getBaseDir(): URL {
  return new URL('.screen-report/', `file://${homedir()}/`);
}

function checkAPIKey(): boolean {
  const apiKey = get('OPENAI_API_KEY');
  return !!apiKey && apiKey !== 'dummy' && apiKey !== 'your-api-key-here';
}

function isOllama(baseURL: string): boolean {
  return baseURL.includes('localhost:11434') || baseURL.includes('127.0.0.1:11434');
}

program
  .name('s2r')
  .description('Screen2Report - 屏幕截图分析日报工具')
  .version('0.2.0');

program
  .command('status')
  .description('Check API configuration and scheduled tasks status')
  .action(async () => {
    try {
      // Check API configuration
      const hasKey = checkAPIKey();
      const baseURL = resolveBaseURL();
      const usingOllama = isOllama(baseURL);

      console.log('[INFO] API Configuration:');
      console.log(`[INFO]   Base URL: ${baseURL}`);

      if (usingOllama) {
        console.log(`[INFO]   Type: Ollama (local)`);
        console.log(`[INFO]   API Key: ${hasKey ? 'configured' : 'using default (ollama)'}`);
      } else {
        console.log(`[INFO]   Type: Remote API`);
        console.log(`[INFO]   API Key: ${hasKey ? 'configured' : 'NOT CONFIGURED'}`);
      }

      if (!hasKey && !usingOllama) {
        console.log('');
        console.log('[WARN] API key not configured!');
        console.log('[INFO] Please set OPENAI_API_KEY in ~/.screen-report/.env');
        console.log('[INFO] Get your API key from: https://platform.openai.com/api-keys');
      }

      // Check scheduled tasks
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
  .command('setup')
  .description('Setup scheduled tasks')
  .action(async () => {
    try {
      const baseDir = getBaseDir();
      const binaryPath = new URL('bin/s2r', baseDir);

      console.log('[INFO] Installing scheduled tasks...');
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
      console.log('[INFO]   Capture: every 5 minutes');
      console.log('[INFO]   Report: daily at 18:30');
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
      // Check API key (skip for Ollama)
      if (!options.dryRun && !checkAPIKey() && !isOllama(resolveBaseURL())) {
        console.error('[ERROR] API key not configured!');
        console.error('[INFO] Please set OPENAI_API_KEY in ~/.screen-report/.env');
        process.exit(1);
      }

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
      // Check API key (skip for Ollama)
      if (!options.dryRun && !checkAPIKey() && !isOllama(resolveBaseURL())) {
        console.error('[ERROR] API key not configured!');
        console.error('[INFO] Please set OPENAI_API_KEY in ~/.screen-report/.env');
        process.exit(1);
      }

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
