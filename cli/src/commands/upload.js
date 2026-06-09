/**
 * cli/src/commands/upload.js
 *
 * Implements the `upload` command:
 *   pr-evidence upload <file> --repo owner/name --pr N --title "..."
 *
 * Appends one artifact to a PR's evidence set:
 *   1. Pre-flight: verify file exists, type allowed, size within cap.
 *   2. Generate an RTDB push key (collision-free, chronologically ordered).
 *   3. Upload the blob to Cloud Storage at the canonical path.
 *   4. Write RTDB metadata (only if the blob upload succeeded).
 *   5. Print the per-PR gallery URL.
 */

import { readFileSync } from 'node:fs';
import {
  ref,
  push,
  set,
  serverTimestamp,
} from 'firebase/database';
import {
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import {
  prKeyPath,
  storageObjectPath,
  encodeSegment,
} from '../../../public/shared/pathCodec.js';
import { preflight } from '../validation.js';

/**
 * Upload a single artifact file and record its metadata.
 *
 * @param {{
 *   file:  string,   // Path to the local file
 *   repo:  string,   // "owner/name"
 *   pr:    string,   // PR number as a string (digits only)
 *   title: string,   // Required human-readable label
 * }} args
 *
 * @param {{
 *   db:             import('firebase/database').Database,
 *   storage:        import('firebase/storage').FirebaseStorage,
 *   galleryBaseUrl: string,
 * }} ctx - Live Firebase handles + gallery URL from config.
 */
export async function upload({ file, repo, pr, title }, ctx) {
  const { db, storage, galleryBaseUrl } = ctx;

  // --title is required; reject empty/whitespace values.
  if (!title || !title.trim()) {
    throw new Error(
      `--title is required and must not be empty.\n` +
      `Usage: pr-evidence upload <file> --repo owner/name --pr N --title "My screenshot"`
    );
  }
  const trimmedTitle = title.trim();

  // Parse owner and repo from "owner/name" (already validated by the CLI router,
  // but we parse again here so this function is self-contained).
  const slashIdx = repo.indexOf('/');
  if (slashIdx === -1 || slashIdx === 0 || slashIdx === repo.length - 1) {
    throw new Error(`Invalid --repo value: "${repo}". Expected "owner/name".`);
  }
  const owner   = repo.slice(0, slashIdx);
  const repoName = repo.slice(slashIdx + 1);
  const number  = String(pr);

  // ------------------------------------------------------------------
  // 1. Pre-flight: existence, type, size
  // ------------------------------------------------------------------
  const { contentType, ext } = preflight(file);

  // ------------------------------------------------------------------
  // 2. Read file bytes
  // ------------------------------------------------------------------
  const fileBytes = readFileSync(file);
  // uploadBytes accepts a Uint8Array; readFileSync returns a Buffer which IS a Uint8Array.

  // ------------------------------------------------------------------
  // 3. Generate the RTDB push key (gives us the artifactId before writing)
  // ------------------------------------------------------------------
  const prPath    = prKeyPath(owner, repoName, number);
  const pushRef   = push(ref(db, prPath));     // generates the key, no network call yet
  const artifactId = pushRef.key;

  // ------------------------------------------------------------------
  // 4. Build the Storage path and upload the blob
  // ------------------------------------------------------------------
  const storagePath = storageObjectPath(owner, repoName, number, artifactId, ext);
  const objRef = storageRef(storage, storagePath);

  try {
    await uploadBytes(objRef, fileBytes, { contentType });
  } catch (err) {
    // Blob upload failed — do NOT write metadata (spec requirement).
    throw new Error(`Storage upload failed: ${err.message}`);
  }

  // ------------------------------------------------------------------
  // 5. Write RTDB metadata (only after successful blob upload)
  // ------------------------------------------------------------------
  // Exactly four fields — rules reject any unknown fields.
  const metadata = {
    storagePath,
    contentType,
    uploadedAt: serverTimestamp(),
    title: trimmedTitle,
  };

  try {
    await set(pushRef, metadata);
  } catch (err) {
    throw new Error(
      `Metadata write failed after blob was uploaded.\n` +
      `The blob exists at "${storagePath}" but its RTDB record was not written.\n` +
      `Error: ${err.message}`
    );
  }

  // ------------------------------------------------------------------
  // 6. Print success + the per-PR gallery URL
  // ------------------------------------------------------------------
  // Use encodeURIComponent for the browser-safe URL (owner/repo may contain dots etc.)
  const galleryUrl =
    `${galleryBaseUrl}/pr/${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}/${number}`;

  console.log(`\nUploaded artifact "${trimmedTitle}" (${contentType})`);
  console.log(`Artifact ID : ${artifactId}`);
  console.log(`Gallery URL : ${galleryUrl}\n`);
}
