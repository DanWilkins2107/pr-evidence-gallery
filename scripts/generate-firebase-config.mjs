/**
 * scripts/generate-firebase-config.mjs
 *
 * Generates public/firebase-config.js from environment variables.
 * Run directly with:
 *   node scripts/generate-firebase-config.mjs
 * Or via npm:
 *   npm run config
 *
 * If a root .env file exists it is parsed and merged into process.env (the real
 * environment always wins — standard dotenv precedence). Missing or empty vars
 * cause a friendly error listing exactly which are absent and pointing to
 * .env.example.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Repo root is one level up from scripts/
const ROOT = resolve(__dirname, '..');
const ENV_FILE_PATH = resolve(ROOT, '.env');
const OUTPUT_PATH   = resolve(ROOT, 'public', 'firebase-config.js');

// ---------------------------------------------------------------------------
// Tiny dotenv parser — no third-party dependency.
// Rules:
//   - Blank lines ignored.
//   - Lines starting with # (after optional whitespace) are comments — ignored.
//   - Everything after the first `=` is the value (values may contain `=`).
//   - Leading/trailing whitespace around key and value is trimmed.
//   - Optional surrounding quotes (" or ') on the value are stripped.
// ---------------------------------------------------------------------------

/**
 * Parses KEY=VALUE lines from a dotenv-format string.
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

    // Strip optional surrounding single or double quotes
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
 * Loads the root .env file (if it exists) and merges parsed keys into
 * process.env. Keys already present in process.env are NOT overwritten
 * (real environment always wins over the file).
 */
function loadDotenvFile() {
  if (!existsSync(ENV_FILE_PATH)) return;

  let text;
  try {
    text = readFileSync(ENV_FILE_PATH, 'utf8');
  } catch (err) {
    // Readable check passed but read failed — warn and continue
    console.warn(`Warning: could not read ${ENV_FILE_PATH}: ${err.message}`);
    return;
  }

  const parsed = parseDotenv(text);
  for (const [key, val] of Object.entries(parsed)) {
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

// ---------------------------------------------------------------------------
// Required Firebase web app config variables
// ---------------------------------------------------------------------------

const REQUIRED_VARS = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_DATABASE_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_APP_ID',
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

loadDotenvFile();

const missing = REQUIRED_VARS.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `\nError: missing required environment variables:\n` +
    missing.map((k) => `  • ${k}`).join('\n') +
    `\n\nCopy .env.example to .env (repo root) and fill in the values.\n` +
    `Values come from: Firebase console → Project settings → Your apps → Web app config.\n`
  );
  process.exit(1);
}

const {
  FIREBASE_API_KEY:        apiKey,
  FIREBASE_AUTH_DOMAIN:    authDomain,
  FIREBASE_DATABASE_URL:   databaseURL,
  FIREBASE_PROJECT_ID:     projectId,
  FIREBASE_STORAGE_BUCKET: storageBucket,
  FIREBASE_APP_ID:         appId,
} = process.env;

const output = `// GENERATED FILE — do not edit by hand.
// Run \`npm run config\` to regenerate (auto-runs before every deploy).
// Source: root .env / environment variables → scripts/generate-firebase-config.mjs
//
// THESE VALUES ARE NOT SECRETS.
// Firebase web config identifies the project but grants no access on its own.
// Security is enforced by Firebase Authentication combined with the RTDB
// Security Rules (database.rules.json) and Cloud Storage Security Rules
// (storage.rules).

export const firebaseConfig = {
  apiKey:        ${JSON.stringify(apiKey)},
  authDomain:    ${JSON.stringify(authDomain)},
  databaseURL:   ${JSON.stringify(databaseURL)},
  projectId:     ${JSON.stringify(projectId)},
  storageBucket: ${JSON.stringify(storageBucket)},
  appId:         ${JSON.stringify(appId)},
};
`;

writeFileSync(OUTPUT_PATH, output, 'utf8');
console.log(`Generated public/firebase-config.js for project ${projectId}`);
