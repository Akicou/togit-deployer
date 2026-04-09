/**
 * Robust .env file parser — handles inline comments, quoted values,
 * empty lines, and full-line comments. Replaces the manual parser in index.ts.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const fileDir = dirname(fileURLToPath(import.meta.url));

export function loadEnv(filePath: string, overwrite = false): boolean {
  if (!existsSync(filePath)) return false;

  const content = readFileSync(filePath, 'utf-8');
  let loaded = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    // Skip empty lines and full-line comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    let key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    // Remove inline comments (but only if value is not quoted)
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const commentIdx = value.indexOf(' #');
      if (commentIdx !== -1) {
        value = value.substring(0, commentIdx).trim();
      }
    }

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Only set if not already present (unless overwrite is true)
    if (overwrite || !process.env[key]) {
      process.env[key] = value;
      loaded++;
    }
  }

  if (loaded > 0) {
    console.log(`  env: loaded ${loaded} variables from ${filePath}`);
  }
  return loaded > 0;
}

export function loadEnvFiles(): void {
  // 1. Check process.cwd()/.env — most common when running from repo root
  loadEnv(join(process.cwd(), '.env'));
  
  // 2. Fallback: resolve from this file's FS location
  //    env.ts → apps/server/src/utils/
  //    repo root is 4 levels up
  loadEnv(join(fileDir, '../../../../.env'));
  
  // 3. Check apps/server/.env (if placed alongside server code)
  loadEnv(join(fileDir, '../../.env'));
}
