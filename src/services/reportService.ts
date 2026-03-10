import { URL } from 'url';
import { mkdir, writeFile } from 'fs/promises';
import type { ReportResult } from '../types/index.js';
import { readReportInputs, buildTimeline, buildFallbackReport, buildPayload } from '../core/reportLogic.js';
import { load } from '../core/dotenv.js';
import { get } from '../core/env.js';
import { makeConfig, callOpenAI, extractText } from './openaiCompat.js';
import { pathFromURL } from '../utils/fileStore.js';

export interface ReportOptions {
  baseDir: URL;
  dateString?: string;
  dryRun?: boolean;
  onProgress?: (message: string) => void;
}

export async function generateReport(options: ReportOptions): Promise<ReportResult> {
  const { baseDir, dateString, dryRun = false, onProgress } = options;

  // Load environment
  await load(new URL('.env', baseDir));

  const targetDate = dateString ?? formatLocalDate(new Date());

  onProgress?.(`Reading analysis records for ${targetDate}...`);
  const analysisFile = new URL(`data/analysis/${targetDate}.jsonl`, baseDir);
  const records = await readReportInputs(analysisFile);

  if (records.length === 0) {
    throw new Error(`No analysis records found for ${targetDate}`);
  }

  const reportDir = new URL('reports/', baseDir);
  await mkdir(pathFromURL(reportDir), { recursive: true });
  const reportFile = new URL(`${targetDate}.md`, reportDir);

  let reportText: string;

  if (dryRun) {
    onProgress?.('Dry run: generating fallback report');
    reportText = buildFallbackReport(targetDate, records);
  } else {
    const apiKey = get('OPENAI_API_KEY') ?? '';
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is missing. Configure it in .env');
    }

    const config = makeConfig(apiKey);
    const model = get('OPENAI_REPORT_MODEL') ?? get('OPENAI_MODEL', 'gpt-4.1-mini') ?? 'gpt-4.1-mini';

    onProgress?.(`Building timeline from ${records.length} records...`);
    const timeline = buildTimeline(records);
    const payload = buildPayload(targetDate, timeline, model, config.style);

    onProgress?.('Calling LLM for report generation...');
    const response = await callOpenAI(config, payload);
    const raw = extractText(response).trim();
    reportText = raw || buildFallbackReport(targetDate, records);
  }

  onProgress?.('Saving report...');
  await writeFile(pathFromURL(reportFile), reportText + '\n');

  onProgress?.('Report completed');

  return {
    reportFile: reportFile.pathname,
    content: reportText,
    recordCount: records.length,
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
