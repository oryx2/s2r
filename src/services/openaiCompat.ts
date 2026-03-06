import { get } from '../core/env.js';

export type APIStyle = 'responses' | 'chat_completions';

export interface OpenAIConfig {
  apiKey: string;
  baseURL: string;
  style: APIStyle;
  useJSONSchema: boolean;
}

export function captureJSONSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      apps_or_sites: { type: 'array', items: { type: 'string' } },
      observed_tasks: { type: 'array', items: { type: 'string' } },
      possible_project_or_topic: { type: 'string' },
      confidence: { type: 'number' },
    },
    required: ['summary', 'apps_or_sites', 'observed_tasks', 'possible_project_or_topic', 'confidence'],
    additionalProperties: false,
  };
}

export function resolveBaseURL(): string {
  const base = get('OPENAI_BASE_URL')
    ?? get('OPENBASEURL')
    ?? get('openbaseurl')
    ?? 'http://localhost:11434/v1';
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export function resolveStyle(baseURL: string): APIStyle {
  const raw = get('OPENAI_API_STYLE')?.trim().toLowerCase();
  if (raw === 'responses') return 'responses';
  if (raw === 'chat_completions') return 'chat_completions';
  return baseURL.includes('api.openai.com') ? 'responses' : 'chat_completions';
}

export function shouldUseJSONSchema(baseURL: string): boolean {
  const val = get('OPENAI_USE_JSON_SCHEMA');
  if (val) {
    return ['1', 'true', 'yes', 'on'].includes(val.toLowerCase());
  }
  return baseURL.includes('api.openai.com');
}

export function makeConfig(apiKey: string): OpenAIConfig {
  const baseURL = resolveBaseURL();
  return {
    apiKey,
    baseURL,
    style: resolveStyle(baseURL),
    useJSONSchema: shouldUseJSONSchema(baseURL),
  };
}

export async function callOpenAI(
  config: OpenAIConfig,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const path = config.style === 'responses' ? '/responses' : '/chat/completions';
  const url = `${config.baseURL}${path}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI HTTP error: ${response.status} ${body}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

export function extractText(response: Record<string, unknown>): string {
  // responses API
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text;
  }

  // responses API output array
  if (Array.isArray(response.output)) {
    for (const item of response.output) {
      if (typeof item !== 'object' || item === null) continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;

      for (const part of content) {
        if (typeof part !== 'object' || part === null) continue;
        const type = (part as Record<string, unknown>).type;
        const text = (part as Record<string, unknown>).text;

        if ((type === 'output_text' || type === 'text') && typeof text === 'string' && text) {
          return text;
        }

        if (type === 'output_json') {
          const jsonObj = (part as Record<string, unknown>).json;
          if (jsonObj) {
            return JSON.stringify(jsonObj);
          }
        }
      }
    }
  }

  // chat completions API
  if (Array.isArray(response.choices)) {
    for (const choice of response.choices) {
      if (typeof choice !== 'object' || choice === null) continue;
      const message = (choice as Record<string, unknown>).message;
      if (typeof message !== 'object' || message === null) continue;

      const content = (message as Record<string, unknown>).content;
      if (typeof content === 'string' && content.trim()) {
        return content;
      }

      if (Array.isArray(content)) {
        const parts = content
          .map(p => (p as Record<string, unknown>)?.text)
          .filter((t): t is string => typeof t === 'string' && t.length > 0);
        if (parts.length > 0) return parts.join('\n');
      }
    }
  }

  return '';
}

export function parseJSONObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Try direct parse
  const direct = parseCandidate(trimmed);
  if (direct) return direct;

  // Try to extract from markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    const fromBlock = parseCandidate(codeBlockMatch[1].trim());
    if (fromBlock) return fromBlock;
  }

  // Try to find JSON starting with { or [
  const jsonStart = trimmed.search(/[{[]/);
  if (jsonStart !== -1) {
    const fromStart = parseCandidate(trimmed.slice(jsonStart));
    if (fromStart) return fromStart;
  }

  return null;
}

function parseCandidate(candidate: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(candidate);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}
