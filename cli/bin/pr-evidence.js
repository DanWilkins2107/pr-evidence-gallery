#!/usr/bin/env node
/**
 * cli/bin/pr-evidence.js
 *
 * Entry point for the pr-evidence CLI.
 *
 * Commands:
 *   pr-evidence upload <file> --repo owner/name --pr N --title "..."
 *   pr-evidence clear --pr owner/name#N
 *   pr-evidence --help
 *
 * Uses Node's built-in node:util parseArgs — no third-party arg-parsing dep.
 */

import { parseArgs } from 'node:util';
import process from 'node:process';

import { loadConfig } from '../src/config.js';
import { initFirebase } from '../src/firebase.js';
import { parseRepoArg } from '../src/validation.js';
import { upload } from '../src/commands/upload.js';
import { clear }  from '../src/commands/clear.js';

// ---------------------------------------------------------------------------
// Usage text
// ---------------------------------------------------------------------------

const USAGE = `
pr-evidence — Private PR Evidence Gallery CLI

COMMANDS

  upload <file> --repo owner/name --pr N --title "..."
      Upload a screenshot or video file and attach it to a GitHub PR.
      Prints the per-PR gallery URL on success.

      Arguments:
        <file>          Path to the image or video file to upload.
                        Allowed types: .png, .jpg, .jpeg, .webp, .mp4, .webm
                        Size caps: images ≤ 10 MB, videos ≤ 50 MB

      Required flags:
        --repo          GitHub repository in "owner/name" format
                        e.g. --repo acme/my-repo
        --pr            Pull request number (digits only)
                        e.g. --pr 42
        --title         Human-readable label for this artifact (non-empty)
                        e.g. --title "Homepage – desktop 1280px"

  clear --pr owner/name#N
      Delete ALL artifacts for a PR (both Storage blobs and RTDB metadata).
      Use this before re-uploading a fresh batch.

      Required flag:
        --pr            Full PR spec in "owner/name#N" format
                        e.g. --pr acme/my-repo#42

GLOBAL FLAGS

  --help, -h      Show this help text and exit.

CONFIGURATION

  Copy cli/.env.example to cli/.env and fill in:
    FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_DATABASE_URL,
    FIREBASE_PROJECT_ID, FIREBASE_STORAGE_BUCKET, FIREBASE_APP_ID,
    BOT_EMAIL, BOT_PASSWORD, GALLERY_BASE_URL

EXAMPLES

  # Upload a single screenshot
  node ./bin/pr-evidence.js upload ./screenshots/home-desktop.png \\
    --repo acme/my-app --pr 123 --title "Home page – desktop"

  # Clear all evidence for a PR before re-uploading
  node ./bin/pr-evidence.js clear --pr acme/my-app#123
`.trimStart();

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

/**
 * Parses process.argv using node:util parseArgs.
 * Returns { command, positionals, values } or prints usage and exits.
 */
function parseCliArgs() {
  const argv = process.argv.slice(2);

  // Handle --help / -h / no args before anything else.
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(USAGE + '\n');
    process.exit(0);
  }

  const command = argv[0];

  if (command === 'upload') {
    // upload <file> --repo ... --pr ... --title ...
    let parsed;
    try {
      parsed = parseArgs({
        args: argv.slice(1),
        options: {
          repo:  { type: 'string' },
          pr:    { type: 'string' },
          title: { type: 'string' },
          help:  { type: 'boolean', short: 'h' },
        },
        allowPositionals: true,
        strict: true,
      });
    } catch (err) {
      die(`Argument error: ${err.message}\n\nRun with --help for usage.`);
    }

    if (parsed.values.help) {
      process.stdout.write(USAGE + '\n');
      process.exit(0);
    }

    const file = parsed.positionals[0];
    if (!file) {
      die(`upload requires a <file> argument.\n\nUsage: pr-evidence upload <file> --repo owner/name --pr N --title "..."`);
    }
    if (!parsed.values.repo) {
      die(`upload requires --repo owner/name.\n\nUsage: pr-evidence upload <file> --repo owner/name --pr N --title "..."`);
    }
    if (!parsed.values.pr) {
      die(`upload requires --pr N (the pull request number).\n\nUsage: pr-evidence upload <file> --repo owner/name --pr N --title "..."`);
    }
    if (!parsed.values.title) {
      die(`upload requires --title "..." (a non-empty label for this artifact).\n\nUsage: pr-evidence upload <file> --repo owner/name --pr N --title "..."`);
    }
    if (!/^\d+$/.test(parsed.values.pr)) {
      die(`--pr must be a positive integer (PR number), got: "${parsed.values.pr}".`);
    }

    // Validate --repo format early for a friendly error.
    try {
      parseRepoArg(parsed.values.repo);
    } catch (err) {
      die(err.message);
    }

    return {
      command: 'upload',
      file,
      repo:  parsed.values.repo,
      pr:    parsed.values.pr,
      title: parsed.values.title,
    };
  }

  if (command === 'clear') {
    let parsed;
    try {
      parsed = parseArgs({
        args: argv.slice(1),
        options: {
          pr:   { type: 'string' },
          help: { type: 'boolean', short: 'h' },
        },
        allowPositionals: false,
        strict: true,
      });
    } catch (err) {
      die(`Argument error: ${err.message}\n\nRun with --help for usage.`);
    }

    if (parsed.values.help) {
      process.stdout.write(USAGE + '\n');
      process.exit(0);
    }

    if (!parsed.values.pr) {
      die(`clear requires --pr owner/name#N.\n\nUsage: pr-evidence clear --pr owner/name#N`);
    }

    return {
      command: 'clear',
      pr: parsed.values.pr,
    };
  }

  // Unknown command
  die(`Unknown command: "${command}".\n\nRun with --help for usage.`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Prints a friendly error message to stderr and exits with code 1.
 * No stack traces for expected failures.
 * @param {string} message
 */
function die(message) {
  process.stderr.write(`\nError: ${message}\n\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseCliArgs();

  // Load config — friendly error if .env is missing/incomplete.
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    die(err.message);
  }

  // Init Firebase & sign in.
  let firebaseCtx;
  try {
    firebaseCtx = await initFirebase(config);
  } catch (err) {
    die(err.message);
  }

  const ctx = {
    db:             firebaseCtx.db,
    storage:        firebaseCtx.storage,
    galleryBaseUrl: config.galleryBaseUrl,
  };

  // Dispatch to the appropriate command.
  try {
    if (args.command === 'upload') {
      await upload(
        { file: args.file, repo: args.repo, pr: args.pr, title: args.title },
        ctx
      );
    } else if (args.command === 'clear') {
      await clear({ pr: args.pr }, ctx);
    }
  } catch (err) {
    die(err.message);
  }

  // Firebase keeps the event loop alive with open connections.
  // Exit cleanly after success.
  process.exit(0);
}

main();
