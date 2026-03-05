// Types and interfaces

export interface AnalysisResult {
  summary: string;
  apps_or_sites: string[];
  observed_tasks: string[];
  possible_project_or_topic: string;
  confidence: number;
  raw_text?: string;
}

export interface AnalysisRecord {
  captured_at: string;
  screenshot_path: string;
  screenshot_paths: string[];
  model: string;
  openai_base_url: string;
  analysis: AnalysisResult;
}

export interface CaptureResult {
  screenshotPaths: string[];
  analysisFile: string;
  record: AnalysisRecord;
}

export interface ReportResult {
  reportFile: string;
  content: string;
  recordCount: number;
}

export interface ReportInput {
  capturedAt: string;
  analysis: AnalysisResult;
}

export interface OpenAIConfig {
  apiKey: string;
  baseURL: string;
  style: APIStyle;
  useJSONSchema: boolean;
}

export enum APIStyle {
  Responses = 'responses',
  ChatCompletions = 'chat_completions'
}

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ModelDownloadProgress {
  fileName: string;
  current: number;
  total: number;
  filePercent: number | null;
}

export type ServerState =
  | { type: 'stopped' }
  | { type: 'starting' }
  | { type: 'running'; pid: number }
  | { type: 'error'; message: string };

export interface LaunchdInstallOptions {
  baseDir: string;
  captureBinary: string;
  reportBinary: string;
  captureArguments: string[];
  reportArguments: string[];
  reportHour: number;
  reportMinute: number;
}

export interface LaunchdStatus {
  capture: boolean;
  report: boolean;
}
