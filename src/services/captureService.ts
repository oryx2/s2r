import { URL } from 'url';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import type { AnalysisRecord, CaptureResult } from '../types/index.js';
import { ensureCaptureDirs, appendJSONL } from '../utils/fileStore.js';
import {
  buildPermissionHelpMessage,
  captureScreenshots,
  hasScreenRecordingPermission,
  isRunningUnderLaunchd,
  requestScreenRecordingPermission,
} from '../utils/screenshot.js';
import { buildPayload, parseAnalysis } from '../core/captureLogic.js';
import { makeConfig, callOpenAI, extractText } from './openaiCompat.js';
import { bool, get } from '../core/env.js';
import { load } from '../core/dotenv.js';

export interface CaptureOptions {
  baseDir: URL;
  dryRun?: boolean;
  requestPermission?: boolean;
  onProgress?: (message: string) => void;
}

export async function runCapture(options: CaptureOptions): Promise<CaptureResult> {
  const { baseDir, dryRun = false, onProgress } = options;

  // Load environment
  await load(new URL('.env', baseDir));

  const now = new Date();
  const dateString = formatLocalDate(now);
  const timeString = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const runningInBackground = isRunningUnderLaunchd();

  onProgress?.('Creating directories...');
  const dirs = await ensureCaptureDirs(baseDir, dateString);

  ensureScreenRecordingPermission(runningInBackground, onProgress);

  onProgress?.('Capturing screenshots...');
  const screenshotPaths = await captureScreenshots(dirs.screenshots, timeString);

  const model = get('OPENAI_MODEL', 'gpt-4.1-mini');
  const baseURL = makeConfig('').baseURL;
  const apiKey = get('OPENAI_API_KEY') ?? '';

  let analysis: AnalysisRecord['analysis'];

  if (dryRun) {
    onProgress?.('Dry run: skipping LLM analysis');
    analysis = {
      summary: 'dry-run: 已截图，未调用 LLM',
      apps_or_sites: [],
      observed_tasks: [],
      possible_project_or_topic: '',
      confidence: 0,
    };
  } else {
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is missing. Configure it in .env');
    }

    onProgress?.('Encoding images...');
    const imageBase64List: string[] = [];
    for (const path of screenshotPaths) {
      const data = await readFile(fileURLToPath(path));
      imageBase64List.push(data.toString('base64'));
    }

    const config = makeConfig(apiKey);
    const payload = buildPayload(model ?? 'gpt-4.1-mini', imageBase64List, config.style, config.useJSONSchema);

    onProgress?.('Calling LLM for analysis...');
    const response = await callOpenAI(config, payload);
    const text = extractText(response);
    const parsed = parseAnalysis(text);

    if (parsed) {
      analysis = parsed;
    } else {
      analysis = {
        summary: '模型输出不是合法 JSON，已记录原文',
        apps_or_sites: [],
        observed_tasks: [],
        possible_project_or_topic: '',
        confidence: 0,
        raw_text: text,
      };
    }
  }

  const capturedAt = now.toISOString();
  const relPaths = screenshotPaths.map(p => {
    const fullPath = fileURLToPath(p);
    const basePath = fileURLToPath(baseDir);
    return fullPath.replace(basePath, '').replace(/^\//, '');
  });

  const record: AnalysisRecord = {
    captured_at: capturedAt,
    screenshot_path: relPaths[0] ?? '',
    screenshot_paths: relPaths,
    model: model ?? 'gpt-4.1-mini',
    openai_base_url: baseURL,
    analysis,
  };

  const analysisFile = new URL(`${dateString}.jsonl`, dirs.analysisDir);

  onProgress?.('Saving analysis record...');
  await appendJSONL(record, analysisFile);

  onProgress?.('Capture completed');

  return {
    screenshotPaths: relPaths,
    analysisFile: analysisFile.pathname,
    record,
  };
}

function ensureScreenRecordingPermission(
  runningInBackground: boolean,
  onProgress?: (message: string) => void
): void {
  const permission = hasScreenRecordingPermission();
  if (permission === true) {
    return;
  }

  if (permission === false) {
    const shouldRequest = bool('SCREENSHOT_REQUEST_PERMISSION', true);
    if (shouldRequest && !runningInBackground) {
      onProgress?.('Screen recording permission missing, requesting access...');
      requestScreenRecordingPermission();

      if (hasScreenRecordingPermission() === true) {
        onProgress?.('Screen recording permission granted');
        return;
      }

      throw new Error(
        `${buildPermissionHelpMessage(false)} 如果刚刚点了允许，请完全退出并重新打开当前终端/应用后再运行一次。`
      );
    }

    throw new Error(buildPermissionHelpMessage(runningInBackground));
  }

  if (bool('SCREENSHOT_STRICT_PERMISSION', false)) {
    throw new Error('Unable to verify screen recording permission on this machine.');
  }
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
