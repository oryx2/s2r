// Environment variable utilities

export class Env {
  static get(name: string): string | undefined {
    return process.env[name];
  }

  static getOrDefault(name: string, defaultValue: string): string {
    return process.env[name] ?? defaultValue;
  }

  static bool(name: string, defaultValue: boolean): boolean {
    const raw = process.env[name]?.trim().toLowerCase();
    if (!raw) return defaultValue;
    return ['1', 'true', 'yes', 'on'].includes(raw);
  }
}

// Standalone functions for convenience
export function get(name: string, defaultValue?: string): string | undefined {
  if (defaultValue !== undefined) {
    return process.env[name] ?? defaultValue;
  }
  return process.env[name];
}

export function getOrDefault(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

export function int(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

export function bool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}
