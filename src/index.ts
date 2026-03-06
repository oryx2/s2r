// Core exports
export { Env, get, getOrDefault, bool } from './core/env.js';
export { DotEnv, load } from './core/dotenv.js';
export { S2RError } from './core/errors.js';
export { SYSTEM_PROMPT, USER_PROMPT, buildPayload as buildCapturePayload, parseAnalysis } from './core/captureLogic.js';
export { readReportInputs, buildTimeline, buildFallbackReport, buildPayload as buildReportPayload } from './core/reportLogic.js';

// Utils exports
export { run, runWithOutput, ShellResult, ShellError } from './utils/shell.js';
export { ensureCaptureDirs, appendJSONL, readLines, directoryExists, isExecutable, pathFromURL } from './utils/fileStore.js';
export { captureScreenshots, captureDisplay, hasScreenRecordingPermission, isRunningUnderLaunchd } from './utils/screenshot.js';

// Services exports
export { APIStyle, OpenAIConfig, captureJSONSchema, resolveBaseURL, resolveStyle, shouldUseJSONSchema, makeConfig, callOpenAI, extractText, parseJSONObject } from './services/openaiCompat.js';
export { runCapture, CaptureOptions } from './services/captureService.js';
export { generateReport, ReportOptions } from './services/reportService.js';
export { LaunchdOptions, LaunchdStatus, CAPTURE_LABEL, REPORT_LABEL, isInstalled, install, uninstall } from './services/launchdService.js';

// Type exports
export type {
  AnalysisResult,
  AnalysisRecord,
  ReportInput,
  CaptureResult,
  ReportResult,
} from './types/index.js';
