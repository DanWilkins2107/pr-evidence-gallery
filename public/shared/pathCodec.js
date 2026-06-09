/**
 * public/shared/pathCodec.js
 *
 * SHARED by BOTH the CLI (Node) and the website (browser).
 * Keep this file strictly environment-neutral — NO Node-only APIs (fs, path, process, etc.)
 * and NO browser-only APIs (window, document, location, etc.).
 *
 * This is the single source of truth for:
 *   - encoding/decoding RTDB key segments (Firebase RTDB keys cannot contain . $ # [ ] /)
 *   - building RTDB key paths and Cloud Storage object paths
 *   - the allowed content-type → extension/size-cap registry
 *
 * Both agents must import from this file so that RTDB paths and Storage paths
 * are always built identically and can never drift between uploader and viewer.
 */

// ---------------------------------------------------------------------------
// Segment encode / decode
// ---------------------------------------------------------------------------

/**
 * Encodes a single path segment (e.g. a GitHub owner or repo name) so it is safe
 * to use as a Firebase Realtime Database key.
 *
 * RTDB forbids these characters in key names: . $ # [ ] /
 * GitHub owner/repo names can contain dots (e.g. "my.org", "my.repo"), so raw
 * names must be encoded before use as RTDB keys.
 *
 * Encoding order (IMPORTANT — must be this order to keep the operation reversible):
 *   1. % → %25  (encode the escape char first so a literal "%25" in input survives)
 *   2. . → %2E
 *   3. $ → %24
 *   4. # → %23
 *   5. [ → %5B
 *   6. ] → %5D
 *   7. / → %2F
 *
 * @param {string} s - Raw segment string (e.g. GitHub owner or repo name).
 * @returns {string} Encoded segment safe for use as an RTDB key.
 */
export function encodeSegment(s) {
  return s
    .replaceAll('%', '%25')  // MUST be first — escapes the escape character
    .replaceAll('.', '%2E')
    .replaceAll('$', '%24')
    .replaceAll('#', '%23')
    .replaceAll('[', '%5B')
    .replaceAll(']', '%5D')
    .replaceAll('/', '%2F');
}

/**
 * Decodes a single encoded RTDB key segment back to the original string.
 * Exact reverse of encodeSegment — decodes all six forbidden-char escapes,
 * then decodes %25 → % LAST (so a literal "%25" in the original survives round-trip).
 *
 * @param {string} s - Encoded RTDB key segment.
 * @returns {string} Original (decoded) string.
 */
export function decodeSegment(s) {
  return s
    .replaceAll('%2F', '/')  // decode forbidden chars first
    .replaceAll('%5D', ']')
    .replaceAll('%5B', '[')
    .replaceAll('%23', '#')
    .replaceAll('%24', '$')
    .replaceAll('%2E', '.')
    .replaceAll('%25', '%');  // MUST be last — unescape the escape character
}

// ---------------------------------------------------------------------------
// Path builders
// ---------------------------------------------------------------------------

/**
 * Builds the RTDB key path for a PR's artifact container.
 *
 * Shape: `prs/{encodedOwner}/{encodedRepo}/{number}`
 *
 * The `number` component is PR number — digits only — so it is used raw
 * (no encoding needed; digits are always valid RTDB key characters).
 *
 * Example:
 *   prKeyPath('my.org', 'my.repo', 42)
 *   // → 'prs/my%2Eorg/my%2Erepo/42'
 *
 * @param {string} owner  - GitHub repository owner (user or org name).
 * @param {string} repo   - GitHub repository name.
 * @param {string|number} number - Pull request number (digits only).
 * @returns {string} RTDB path string (no leading slash).
 */
export function prKeyPath(owner, repo, number) {
  return `prs/${encodeSegment(owner)}/${encodeSegment(repo)}/${String(number)}`;
}

/**
 * Builds the Cloud Storage object path for a specific artifact.
 *
 * Shape: `prs/{encodedOwner}/{encodedRepo}/{number}/{artifactId}.{ext}`
 *
 * Uses the same encoded owner/repo segments as prKeyPath so that RTDB metadata
 * and Storage blobs are always mechanically linked.
 *
 * Example:
 *   storageObjectPath('my.org', 'my.repo', 42, '-NxAbc123', 'png')
 *   // → 'prs/my%2Eorg/my%2Erepo/42/-NxAbc123.png'
 *
 * @param {string} owner      - GitHub repository owner.
 * @param {string} repo       - GitHub repository name.
 * @param {string|number} number     - Pull request number.
 * @param {string} artifactId - RTDB push() key used as the artifact identifier.
 * @param {string} ext        - File extension (without leading dot), e.g. 'png', 'mp4'.
 * @returns {string} Cloud Storage object path (no leading slash).
 */
export function storageObjectPath(owner, repo, number, artifactId, ext) {
  return `prs/${encodeSegment(owner)}/${encodeSegment(repo)}/${String(number)}/${artifactId}.${ext}`;
}

// ---------------------------------------------------------------------------
// Content-type registry
// ---------------------------------------------------------------------------

/**
 * Registry of allowed MIME content types with their associated file extension
 * and maximum upload size in bytes.
 *
 * This object is the single authoritative source for:
 *   - which content types are accepted (allowlist)
 *   - the canonical file extension for each type
 *   - the size cap enforced in both Storage Security Rules (hard limit)
 *     and CLI pre-flight checks (friendly error before attempting upload)
 *
 * Size caps:
 *   - Images: 10 MB  (10 * 1024 * 1024 bytes)
 *   - Videos: 50 MB  (50 * 1024 * 1024 bytes)
 *
 * @type {Readonly<Record<string, { ext: string, maxBytes: number }>>}
 */
export const CONTENT_TYPES = Object.freeze({
  'image/png':  { ext: 'png',  maxBytes: 10 * 1024 * 1024 },
  'image/jpeg': { ext: 'jpg',  maxBytes: 10 * 1024 * 1024 },
  'image/webp': { ext: 'webp', maxBytes: 10 * 1024 * 1024 },
  'video/mp4':  { ext: 'mp4',  maxBytes: 50 * 1024 * 1024 },
  'video/webm': { ext: 'webm', maxBytes: 50 * 1024 * 1024 },
});

/**
 * Returns the canonical file extension for a given content type.
 * Throws a TypeError if the content type is not in the allowlist.
 *
 * @param {string} ct - MIME content type (e.g. 'image/png').
 * @returns {string} File extension without leading dot (e.g. 'png').
 * @throws {TypeError} If the content type is not in CONTENT_TYPES.
 */
export function extForContentType(ct) {
  const entry = CONTENT_TYPES[ct];
  if (!entry) {
    throw new TypeError(
      `Content type "${ct}" is not allowed. Allowed types: ${Object.keys(CONTENT_TYPES).join(', ')}`
    );
  }
  return entry.ext;
}

/**
 * Returns true if the given content type is in the allowed list.
 *
 * @param {string} ct - MIME content type to check.
 * @returns {boolean}
 */
export function isAllowedContentType(ct) {
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPES, ct);
}

/**
 * Returns true if the given content type is a video type.
 * Useful for switching between <img> and <video> rendering in the gallery.
 *
 * @param {string} ct - MIME content type to check.
 * @returns {boolean}
 */
export function isVideo(ct) {
  return ct === 'video/mp4' || ct === 'video/webm';
}
