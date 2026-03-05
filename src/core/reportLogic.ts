import type { ReportInput } from '../types/index.js';
import { readLines } from '../utils/fileStore.js';
import type { APIStyle } from '../services/openaiCompat.js';
import { URL } from 'url';

export async function readReportInputs(jsonlPath: URL): Promise<ReportInput[]> {
  const lines = await readLines(jsonlPath);
  const results: ReportInput[] = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      const capturedAt = obj.captured_at;
      const analysisObj = obj.analysis as Record<string, unknown> | undefined;

      if (typeof capturedAt !== 'string' || !analysisObj) continue;

      const analysis = {
        summary: String(analysisObj.summary ?? ''),
        apps_or_sites: Array.isArray(analysisObj.apps_or_sites) ? analysisObj.apps_or_sites.map(String) : [],
        observed_tasks: Array.isArray(analysisObj.observed_tasks) ? analysisObj.observed_tasks.map(String) : [],
        possible_project_or_topic: String(analysisObj.possible_project_or_topic ?? ''),
        confidence: Number(analysisObj.confidence ?? 0),
        raw_text: analysisObj.raw_text ? String(analysisObj.raw_text) : undefined,
      };

      results.push({ capturedAt, analysis });
    } catch {
      // Skip invalid lines
    }
  }

  return results;
}

export function buildTimeline(records: ReportInput[]): string {
  const lines: string[] = [];

  for (const rec of records) {
    const time = formatTime(rec.capturedAt);
    const apps = rec.analysis.apps_or_sites.join(', ');
    const tasks = rec.analysis.observed_tasks.join('; ');
    lines.push(`- ${time} | summary=${rec.analysis.summary} | apps=${apps} | tasks=${tasks} | topic=${rec.analysis.possible_project_or_topic}`);
  }

  return lines.join('\n');
}

function formatTime(capturedAt: string): string {
  try {
    const date = new Date(capturedAt);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return capturedAt;
  }
}

export function buildFallbackReport(dateString: string, records: ReportInput[]): string {
  return `# ${dateString} 工作汇报

## 概览
- 共记录 ${records.length} 次屏幕活动。

## 时间线
${buildTimeline(records)}

## 明日计划
- 根据今天的阻塞点继续推进。
`;
}

export function buildPayload(
  dateString: string,
  timeline: string,
  model: string,
  style: APIStyle
): Record<string, unknown> {
  const prompt = `请根据以下同一天的屏幕活动分析记录，生成中文工作日报 Markdown。
日期：${dateString}

要求：
1) 先给出 3-5 条核心工作结论
2) 给出时间线摘要（按时间段合并）
3) 给出产出清单
4) 给出风险/阻塞
5) 给出明日计划
6) 明确哪些内容是推断（如果有）

原始记录：
${timeline}`;

  if (style === 'responses') {
    return {
      model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: '你是严谨的工作记录整理助手。' }] },
        { role: 'user', content: [{ type: 'input_text', text: prompt }] },
      ],
      max_output_tokens: 1600,
    };
  }

  return {
    model,
    messages: [
      { role: 'system', content: '你是严谨的工作记录整理助手。' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1600,
  };
}
