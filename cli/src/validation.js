/**
 * cli/src/validation.js
 *
 * Pre-flight validation helpers — all checks happen locally before any
 * network call, so failures are fast and friendly.
 *
 * Exports:
 *   detectContentType(filePath)  — infer MIME from extension
 *   preflight(filePath)          — existence + type + size check
 *   parseRepoArg(s)              — parse "owner/name" → { owner, repo }
 *   parsePrSpec(s)               — parse "owner/name#N" → { owner, repo, number }
 */

import { statSync, existsSync } from 'node:fs';
import { extname } from 'node:path';
import {
  CONTENT_TYPES,
  isAllowedContentType,
} from '../../public/shared/pathCodec.js';

// ---------------------------------------------------------------------------
// Extension → MIME mapping
// ---------------------------------------------------------------------------

/** Map of lowercase file extension (with leading dot) to MIME type. */
const EXT_TO_MIME = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4':  'video/mp4',
  '.webm': 'video/webm',
};

/**
 * Infers the MIME content type from a file path's extension.
 *
 * @param {string} filePath - Path to the file (only the extension is examined).
 * @returns {string | null} MIME type string, or null if the extension is unknown.
 */
export function detectContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return EXT_TO_MIME[ext] ?? null;
}

// ---------------------------------------------------------------------------
// Pre-flight check
// ---------------------------------------------------------------------------

/**
 * Human-readable file size string (e.g. "12.3 MB").
 * @param {number} bytes
 * @returns {string}
 */
function humanBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024)        return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/**
 * Runs all pre-flight checks on a file before attempting any upload.
 *
 * Checks (in order):
 *   1. File exists.
 *   2. Extension maps to a known MIME type.
 *   3. MIME type is in the allowlist.
 *   4. File size is within the cap for its content type.
 *
 * @param {string} filePath - Absolute or relative path to the local file.
 * @returns {{ contentType: string, ext: string, sizeBytes: number }}
 * @throws {Error} A friendly, user-readable message on any failure.
 */
export function preflight(filePath) {
  // 1. Existence check
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  // 2. Infer content type from extension
  const contentType = detectContentType(filePath);
  if (contentType === null) {
    const ext = extname(filePath) || '(no extension)';
    throw new Error(
      `Unsupported file extension "${ext}".\n` +
      `Allowed extensions: .png, .jpg, .jpeg, .webp, .mp4, .webm`
    );
  }

  // 3. Allowlist check (belt-and-suspenders — detectContentType already gates this)
  if (!isAllowedContentType(contentType)) {
    throw new Error(
      `Content type "${contentType}" is not in the allowlist.\n` +
      `Allowed types: ${Object.keys(CONTENT_TYPES).join(', ')}`
    );
  }

  // 4. Size cap check
  const { maxBytes, ext } = CONTENT_TYPES[contentType];
  const { size: sizeBytes } = statSync(filePath);
  if (sizeBytes > maxBytes) {
    throw new Error(
      `File is too large: ${humanBytes(sizeBytes)} (cap for ${contentType} is ${humanBytes(maxBytes)}).\n` +
      `Please reduce the file size before uploading.`
    );
  }

  return { contentType, ext, sizeBytes };
}

// ---------------------------------------------------------------------------
// Argument parsers
// ---------------------------------------------------------------------------

/**
 * Parses an "owner/name" repository argument.
 *
 * @param {string} s - Raw argument string, e.g. "acme/my-repo".
 * @returns {{ owner: string, repo: string }}
 * @throws {Error} If the format is invalid.
 */
export function parseRepoArg(s) {
  if (typeof s !== 'string' || !s.trim()) {
    throw new Error(`--repo requires a value in the format "owner/name" (e.g. acme/my-repo).`);
  }

  const parts = s.trim().split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid --repo format: "${s}".\n` +
      `Expected "owner/name" (e.g. acme/my-repo).`
    );
  }

  const [owner, repo] = parts;
  return { owner, repo };
}

/**
 * Parses an "owner/name#N" PR spec argument.
 *
 * @param {string} s - Raw argument string, e.g. "acme/my-repo#42".
 * @returns {{ owner: string, repo: string, number: string }}
 * @throws {Error} If the format is invalid.
 */
export function parsePrSpec(s) {
  if (typeof s !== 'string' || !s.trim()) {
    throw new Error(`--pr (for clear) requires a value in the format "owner/name#N" (e.g. acme/my-repo#42).`);
  }

  const hashIdx = s.lastIndexOf('#');
  if (hashIdx === -1) {
    throw new Error(
      `Invalid PR spec: "${s}".\n` +
      `Expected "owner/name#N" (e.g. acme/my-repo#42).`
    );
  }

  const repoStr  = s.slice(0, hashIdx);
  const numberStr = s.slice(hashIdx + 1);

  if (!/^\d+$/.test(numberStr) || numberStr === '') {
    throw new Error(
      `Invalid PR number in spec: "${s}".\n` +
      `The part after "#" must be digits only (e.g. acme/my-repo#42).`
    );
  }

  const { owner, repo } = parseRepoArg(repoStr);
  return { owner, repo, number: numberStr };
}
