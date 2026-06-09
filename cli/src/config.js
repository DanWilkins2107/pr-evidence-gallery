/**
 * cli/src/config.js
 *
 * Loads runtime configuration from environment variables, with optional
 * loading from a local cli/.env file (gitignored). Validates that all
 * required variables are present and throws a friendly error listing any
 * that are missing.
 *
 * A tiny hand-rolled dotenv parser is used — no third-party dependency.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Path to the .env file sitting in cli/ (one level up from src/)
const ENV_FILE_PATH = resolve(__dirname, '..', '.env');

/**
 * Parses KEY=VALUE lines from a dotenv-format string.
 * Rules:
 *   - Blank lines are ignored.
 *   - Lines starting with # (after optional leading whitespace) are comments and ignored.
 *   - Everything after the first `=` is the value (values may contain `=`).
 *   - Leading/trailing whitespace around key and value is trimmed.
 *   - Optional surrounding quotes (" or ') on the value are stripped.
 *
 * @param {string} text - Raw dotenv file contents.
 * @returns {Record<string, string>} Parsed key→value pairs.
 */
function parseDotenv(text) {
  const result = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue; // malformed line — skip silently

    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();

    // Strip optional surrounding quotes
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }

    if (key) result[key] = val;
  }
  return result;
}

/**
 * Attempts to read and parse cli/.env, then merges any keys that are NOT
 * already present in process.env (process.env always wins so that CI/shell
 * env vars take precedence over the file).
 */
function loadDotenvFile() {
  let text;
  try {
    text = readFileSync(ENV_FILE_PATH, 'utf8');
  } catch {
    // .env is optional — if it doesn't exist we rely on process.env
    return;
  }

  const parsed = parseDotenv(text);
  for (const [key, val] of Object.entries(parsed)) {
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

/**
 * Required environment variable names.
 */
const REQUIRED_VARS = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_DATABASE_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_APP_ID',
  'BOT_EMAIL',
  'BOT_PASSWORD',
  'GALLERY_BASE_URL',
];

/**
 * Loads and validates all required configuration.
 *
 * First tries to read cli/.env (silently ignored if absent), then reads
 * from process.env. Throws a friendly error listing any missing variables
 * and pointing to cli/.env.example.
 *
 * @returns {{
 *   firebaseConfig: {
 *     apiKey: string,
 *     authDomain: string,
 *     databaseURL: string,
 *     projectId: string,
 *     storageBucket: string,
 *     appId: string,
 *   },
 *   botEmail: string,
 *   botPassword: string,
 *   galleryBaseUrl: string,
 * }}
 */
export function loadConfig() {
  loadDotenvFile();

  const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required configuration variables:\n` +
      missing.map((k) => `  • ${k}`).join('\n') +
      `\n\nCopy cli/.env.example to cli/.env and fill in the values.`
    );
  }

  return {
    firebaseConfig: {
      apiKey:         process.env.FIREBASE_API_KEY,
      authDomain:     process.env.FIREBASE_AUTH_DOMAIN,
      databaseURL:    process.env.FIREBASE_DATABASE_URL,
      projectId:      process.env.FIREBASE_PROJECT_ID,
      storageBucket:  process.env.FIREBASE_STORAGE_BUCKET,
      appId:          process.env.FIREBASE_APP_ID,
    },
    botEmail:      process.env.BOT_EMAIL,
    botPassword:   process.env.BOT_PASSWORD,
    galleryBaseUrl: process.env.GALLERY_BASE_URL.replace(/\/$/, ''), // strip trailing slash
  };
}
