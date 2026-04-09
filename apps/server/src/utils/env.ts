/**
 * Robust .env file parser — handles inline comments, quoted values,
 * empty lines, and full-line comments. Replaces the manual parser in index.ts.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export function loadEnv(filePath: string, overwrite = false): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, 'utf-8');
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
    }
  }
}

export function loadEnvFiles(): void {
  const __dirname = dirname(fileURLToPath(import.meta.url));
  // Check apps/server/.env
  loadEnv(join(__dirname, '../../.env'));
  // Check root .env (only set keys not already set)
  loadEnv(join(__dirname, '../../../.env'));
}
