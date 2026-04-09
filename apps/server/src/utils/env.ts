/**
 * Robust .env file parser — handles inline comments, quoted values,
 * CRLF line endings, UTF-8 BOM, empty lines, and full-line comments.
 */
import { readFileSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const fileDir = dirname(fileURLToPath(import.meta.url));

/**
 * Verbose flag: set VERBOSE_ENV=true for detailed logging
 */
const DEBUG = process.env.VERBOSE_ENV === 'true';

function debugLog(msg: string): void {
  if (DEBUG) console.log(`    [env-debug] ${msg}`);
}

export function loadEnv(filePath: string, overwrite = false): boolean {
  if (!existsSync(filePath)) {
    debugLog(`File not found: ${filePath}`);
    return false;
  }

  const stat = statSync(filePath);
  debugLog(`File exists: ${filePath} (${stat.size} bytes)`);

  let content = readFileSync(filePath, 'utf-8');
  debugLog(`Content length: ${content.length} chars`);

  // Show first 100 chars of raw content
  debugLog(`First 150 bytes (hex): ${Buffer.from(content.substring(0, 50)).toString('hex')}`);
  debugLog(`First 150 chars: ${JSON.stringify(content.substring(0, 50))}`);

  // Strip UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xFEFF) {
    debugLog('Found UTF-8 BOM, stripping');
    content = content.substring(1);
  }

  // Normalize CRLF to LF
  const hadCRLF = content.includes('\r\n');
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (hadCRLF) debugLog('Found CRLF, normalizing to LF');

  const lines = content.split('\n');
  debugLog(`Total lines: ${lines.length}`);

  let loaded = 0;
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    debugLog(`Line ${i + 1}: ${JSON.stringify(line)} (raw: ${JSON.stringify(rawLine)})`);

    // Skip empty lines and full-line comments
    if (!line || line.startsWith('#')) {
      debugLog(`  → skipped (empty or comment)`);
      continue;
    }

    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      debugLog(`  → skipped (no '=' found)`);
      continue;
    }

    let key = line.substring(0, eqIndex).trim();
    let value = line.substring(eqIndex + 1).trim();

    // Remove inline comments
    if (!value.startsWith('"') && !value.startsWith("'")) {
      const ci = value.indexOf(' #');
      if (ci !== -1) value = value.substring(0, ci).trim();
    }

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    debugLog(`  → key="${key}" value="${value.substring(0, 10)}..."`);

    const alreadyExists = process.env[key] !== undefined;
    debugLog(`    alreadyExists=${alreadyExists}, overwrite=${overwrite}`);

    if (!alreadyExists || overwrite) {
      process.env[key] = value;
      loaded++;
      debugLog(`    ✓ loaded`);
    } else {
      debugLog(`    ✗ skipped (already set)`);
    }
  }

  debugLog(`Result: loaded ${loaded} out of ${lines.length} lines`);

  if (loaded > 0) {
    console.log(`  env: loaded ${loaded} vars from ${filePath}`);
  }

  return loaded > 0;
}

export function loadEnvFiles(): void {
  console.log(`  env: process.cwd() = "${process.cwd()}"`);
  console.log(`  env: __dirname = "${fileDir}"`);

  // 1. process.cwd()/.env
  loadEnv(join(process.cwd(), '.env'));

  // 2. From source file to repo root (4 levels up)
  loadEnv(join(fileDir, '../../../../.env'));

  // 3. apps/server/.env
  loadEnv(join(fileDir, '../../.env'));

  // Summary
  const relevantEnvVars = ['LOCALTONET_AUTH_TOKEN', 'GITHUB_APP_CLIENT_ID'];
  console.log(`  env: summary — LOCALTONET_AUTH_TOKEN=${process.env.LOCALTONET_AUTH_TOKEN ? '(set)' : '(NOT set)'}, GITHUB_APP_CLIENT_ID=${process.env.GITHUB_APP_CLIENT_ID ? '(set)' : '(NOT set)'}`);
  if (process.env.LOCALTONET_AUTH_TOKEN) {
    console.log(`  env: LOCALTONET_AUTH_TOKEN value length = ${process.env.LOCALTONET_AUTH_TOKEN.length}`);
  }
}
