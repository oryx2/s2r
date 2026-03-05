import { readFile } from 'fs/promises';
import { fileURLToPath, URL } from 'url';

// .env file loader

export class DotEnv {
  static async loadFromPath(filePath: string): Promise<void> {
    try {
      const raw = await readFile(filePath, 'utf-8');
      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
          continue;
        }
        const [keyPart, ...valueParts] = trimmed.split('=');
        if (!keyPart || valueParts.length === 0) continue;

        const key = keyPart.trim();
        let value = valueParts.join('=').trim();

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        // Only set if not already in environment
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    } catch {
      // File doesn't exist, ignore
    }
  }
}

// Standalone load function for URL
export async function load(envFile: URL): Promise<void> {
  try {
    const filePath = fileURLToPath(envFile);
    const raw = await readFile(filePath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
        continue;
      }
      const [keyPart, ...valueParts] = trimmed.split('=');
      if (!keyPart || valueParts.length === 0) continue;

      const key = keyPart.trim();
      let value = valueParts.join('=').trim();

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Only set if not already in environment
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // File doesn't exist, ignore
  }
}
