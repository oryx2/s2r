import { URL } from 'url';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';
import type { AnalysisRecord, CaptureResult } from '../types/index.js';
import { ensureCaptureDirs, appendJSONL } from '../utils/fileStore.js';
import { captureScreenshots } from '../utils/screenshot.js';
import { buildPayload, parseAnalysis } from '../core/captureLogic.js';
import { makeConfig, callOpenAI, extractText } from './openaiCompat.js';
import { get } from '../core/env.js';
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
  const dateString = now.toISOString().split('T')[0];
  const timeString = now.toTimeString().slice(0, 8).replace(/:/g, '');

  onProgress?.('Creating directories...');
  const dirs = await ensureCaptureDirs(baseDir, dateString);

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
