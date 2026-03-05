import { captureJSONSchema, type APIStyle, parseJSONObject } from '../services/openaiCompat.js';
import type { AnalysisResult } from '../types/index.js';

export const SYSTEM_PROMPT =
  '你是一个屏幕活动分析助手。给定用户当前电脑屏幕截图，提取可观察到的工作活动信息。不要凭空捏造不可见内容，不确定时请明确写不确定。';

export const USER_PROMPT =
  `请分析截图并输出 JSON。输入可能包含多张截图（来自不同显示器），请综合分析。字段如下：
{
  "summary": "一句话总结当前正在做的事",
  "apps_or_sites": ["可见应用或网站"],
  "observed_tasks": ["可观察到的具体动作"],
  "possible_project_or_topic": "可能涉及的项目或主题",
  "confidence": 0.0
}
只输出 JSON，不要使用 markdown 代码块。`;

export function buildPayload(
  model: string,
  imageBase64List: string[],
  style: APIStyle,
  useJSONSchema: boolean
): Record<string, unknown> {
  if (style === 'responses') {
    const userContent: Record<string, unknown>[] = [{ type: 'input_text', text: USER_PROMPT }];
    for (const img of imageBase64List) {
      userContent.push({ type: 'input_image', image_url: `data:image/png;base64,${img}` });
    }

    const payload: Record<string, unknown> = {
      model,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: SYSTEM_PROMPT }] },
        { role: 'user', content: userContent },
      ],
      max_output_tokens: 400,
    };

    if (useJSONSchema) {
      payload.text = {
        format: {
          type: 'json_schema',
          name: 'screen_activity',
          schema: captureJSONSchema(),
          strict: true,
        },
      };
    }

    return payload;
  }

  // chat_completions style
  const userContent: Record<string, unknown>[] = [{ type: 'text', text: USER_PROMPT }];
  for (const img of imageBase64List) {
    userContent.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${img}` } });
  }

  const payload: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    max_tokens: 400,
  };

  if (useJSONSchema) {
    payload.response_format = { type: 'json_object' };
  }

  return payload;
}

export function parseAnalysis(rawText: string): AnalysisResult | null {
  const obj = parseJSONObject(rawText);
  if (!obj) return null;
  return analysisResultFromObj(obj);
}

function analysisResultFromObj(obj: Record<string, unknown>): AnalysisResult {
  const summary = typeof obj.summary === 'string' ? obj.summary : '';
  const apps = Array.isArray(obj.apps_or_sites) ? obj.apps_or_sites.filter((s): s is string => typeof s === 'string') : [];
  const tasks = Array.isArray(obj.observed_tasks) ? obj.observed_tasks.filter((s): s is string => typeof s === 'string') : [];
  const topic = typeof obj.possible_project_or_topic === 'string' ? obj.possible_project_or_topic : '';
  const confidence = typeof obj.confidence === 'number' ? obj.confidence : 0;

  return {
    summary,
    apps_or_sites: apps,
    observed_tasks: tasks,
    possible_project_or_topic: topic,
    confidence,
  };
}
