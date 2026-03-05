import { spawn, type ChildProcess } from 'child_process';
import { URL, fileURLToPath } from 'url';

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class ShellError extends Error {
  constructor(
    public readonly result: ShellResult,
    message: string
  ) {
    super(message);
    this.name = 'ShellError';
  }
}

export async function run(
  launchPath: string,
  args: string[],
  options: {
    cwd?: URL;
    env?: Record<string, string>;
  } = {}
): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const cwd = options.cwd ? fileURLToPath(options.cwd) : undefined;
    const env = options.env ? { ...process.env, ...options.env } : process.env;

    const childProcess: ChildProcess = spawn(launchPath, args, {
      cwd,
      env,
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    childProcess.on('close', (code: number | null) => {
      const result: ShellResult = {
        exitCode: code ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
      resolve(result);
    });

    childProcess.on('error', (err: Error) => {
      reject(err);
    });
  });
}

export async function runWithOutput(
  launchPath: string,
  args: string[],
  options: {
    cwd?: URL;
    env?: Record<string, string>;
    onOutput?: (chunk: string) => void;
  } = {}
): Promise<ShellResult> {
  return new Promise((resolve, reject) => {
    const cwd = options.cwd ? fileURLToPath(options.cwd) : undefined;
    const env = options.env ? { ...process.env, ...options.env } : process.env;

    const childProcess: ChildProcess = spawn(launchPath, args, {
      cwd,
      env,
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stdout += chunk;
      options.onOutput?.(chunk);
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString();
      stderr += chunk;
      options.onOutput?.(chunk);
    });

    childProcess.on('close', (code: number | null) => {
      const result: ShellResult = {
        exitCode: code ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };
      resolve(result);
    });

    childProcess.on('error', (err: Error) => {
      reject(err);
    });
  });
}
