/**
 * Robust .env file parser — handles inline comments, quoted values,
 * empty lines, and full-line comments.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const fileDir = dirname(fileURLToPath(import.meta.url));

export function loadEnv(filePath: string, overwrite = false): boolean {
  if (!existsSync(filePath)) {
    console.log(`  env: skipping (not found) ${filePath}`);
    return false;
  }

  const content = readFileSync(filePath, 'utf-8');
  let loaded = 0;
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    let key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    if (!value.startsWith('"') && !value.startsWith("'")) {
      const ci = value.indexOf(' #');
      if (ci !== -1) value = value.substring(0, ci).trim();
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (overwrite || !process.env[key]) {
      process.env[key] = value;
      loaded++;
    }
  }

  console.log(`  env: loaded ${loaded} vars from ${filePath}`);
  return loaded > 0;
}

export function loadEnvFiles(): void {
  console.log(`  env: process.cwd() = "${process.cwd()}"`);
  console.log(`  env: __dirname equivalent = "${fileDir}"`);

  // 1. process.cwd()/.env — when running `bun apps/server/src/index.ts` from repo root
  loadEnv(join(process.cwd(), '.env'));

  // 2. Try resolving from the server source directory up to repo root
  //    env.ts at: apps/server/src/utils/
  //    repo root: 4 levels up
  loadEnv(join(fileDir, '../../../../.env'));

  // 3. Check apps/server/.env (if placed alongside server code)
  loadEnv(join(fileDir, '../../.env'));
}
