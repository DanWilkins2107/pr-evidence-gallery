/**
 * cli/src/commands/init.js
 *
 * Implements the `init` command:
 *   pr-evidence init
 *
 * Wires the current working directory (a consuming repo) to the pr-evidence
 * Claude Code plugin by merging two keys into <CWD>/.claude/settings.json:
 *
 *   extraKnownMarketplaces["pr-evidence-tools"] = {
 *     "source": { "source": "directory", "path": "<galleryRepoRoot>" }
 *   }
 *   enabledPlugins["pr-evidence@pr-evidence-tools"] = true
 *
 * All other keys in settings.json are preserved (merge, not overwrite).
 * Running init twice is a no-op beyond rewriting the same values — idempotent.
 *
 * This command requires NO Firebase config and must NOT be called after
 * loadConfig()/initFirebase() — it is a pure local filesystem operation.
 *
 * Uses only: node:fs, node:path, node:url
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolve the gallery repo root from this file's location.
 * cli/src/commands/init.js → up three levels → repo root.
 * Normalize to forward slashes so the JSON path value is portable.
 */
function resolveGalleryRepoRoot() {
  const root = resolve(__dirname, '..', '..', '..');
  // Normalize Windows backslashes to forward slashes for JSON portability.
  return root.replace(/\\/g, '/');
}

/**
 * One-time per-repo setup: writes (or merges into) <CWD>/.claude/settings.json
 * to point Claude Code at this repo's local plugin.
 *
 * @param {string[]} _args  - Unused (no flags for this command).
 * @param {object}   _ctx   - Unused (no Firebase context needed).
 */
export async function init(_args, _ctx) {
  const galleryRoot = resolveGalleryRepoRoot();
  const cwd         = process.cwd();
  const claudeDir   = resolve(cwd, '.claude');
  const settingsPath = resolve(claudeDir, 'settings.json');

  // ------------------------------------------------------------------
  // 1. Read existing settings.json (or start from an empty object)
  // ------------------------------------------------------------------
  let settings = {};

  if (existsSync(settingsPath)) {
    let raw;
    try {
      raw = readFileSync(settingsPath, 'utf8');
    } catch (err) {
      throw new Error(`Could not read ${settingsPath}: ${err.message}`);
    }

    // Strip UTF-8 BOM if present (PowerShell 5.1 Set-Content -Encoding utf8
    // writes a BOM that JSON.parse rejects).
    if (raw.charCodeAt(0) === 0xFEFF) {
      raw = raw.slice(1);
    }

    try {
      settings = JSON.parse(raw);
    } catch {
      throw new Error(
        `${settingsPath} contains invalid JSON.\n` +
        `Fix or delete it, then run 'pr-evidence init' again.`
      );
    }
  }

  // ------------------------------------------------------------------
  // 2. Merge the two required keys (preserve everything else)
  // ------------------------------------------------------------------

  // extraKnownMarketplaces — top-level object keyed by marketplace name.
  if (typeof settings.extraKnownMarketplaces !== 'object' || settings.extraKnownMarketplaces === null) {
    settings.extraKnownMarketplaces = {};
  }
  settings.extraKnownMarketplaces['pr-evidence-tools'] = {
    source: {
      source: 'directory',
      path:   galleryRoot,
    },
  };

  // enabledPlugins — top-level object keyed by "pluginName@marketplaceName".
  if (typeof settings.enabledPlugins !== 'object' || settings.enabledPlugins === null) {
    settings.enabledPlugins = {};
  }
  settings.enabledPlugins['pr-evidence@pr-evidence-tools'] = true;

  // ------------------------------------------------------------------
  // 3. Write back — create .claude/ dir if needed
  // ------------------------------------------------------------------
  mkdirSync(claudeDir, { recursive: true });

  const output = JSON.stringify(settings, null, 2) + '\n';
  writeFileSync(settingsPath, output, 'utf8');

  // ------------------------------------------------------------------
  // 4. Print a clear success summary
  // ------------------------------------------------------------------
  console.log(`
pr-evidence init — done!

Written: ${settingsPath}

  • Marketplace "pr-evidence-tools" now points at:
      ${galleryRoot}

  • Plugin enabled: pr-evidence@pr-evidence-tools

Invoke the skill inside this repo as:
  /pr-evidence:pr-evidence

Note: the first time you open/trust this workspace in Claude Code, you may be
prompted once to allow the local plugin — this is expected.

Prerequisites (already required for normal CLI use):
  • gh must be authenticated  → gh auth status
  • pr-evidence must be on PATH → pr-evidence --help
`);
}
