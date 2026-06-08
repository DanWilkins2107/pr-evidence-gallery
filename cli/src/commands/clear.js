/**
 * cli/src/commands/clear.js
 *
 * Implements the `clear` command:
 *   pr-evidence clear --pr owner/name#N
 *
 * Wipes ALL evidence for a PR — both Cloud Storage blobs and the RTDB subtree.
 * If the PR has no evidence, prints a friendly no-op message.
 *
 * Order of operations:
 *   1. List all Storage objects under prs/{enc}/{enc}/{N}/
 *   2. Delete each blob via deleteObject.
 *   3. Remove the RTDB node at prKeyPath(owner, repo, number).
 */

import { ref, remove } from 'firebase/database';
import {
  ref as storageRef,
  listAll,
  deleteObject,
} from 'firebase/storage';
import {
  prKeyPath,
  encodeSegment,
} from '../../../public/shared/pathCodec.js';
import { parsePrSpec } from '../validation.js';

/**
 * Clears all artifacts for a PR.
 *
 * @param {{
 *   pr: string,  // "owner/name#N" — full PR spec
 * }} args
 *
 * @param {{
 *   db:      import('firebase/database').Database,
 *   storage: import('firebase/storage').FirebaseStorage,
 * }} ctx - Live Firebase handles.
 */
export async function clear({ pr }, ctx) {
  const { db, storage } = ctx;

  // Parse the PR spec — throws a friendly error on bad format.
  const { owner, repo, number } = parsePrSpec(pr);

  // ------------------------------------------------------------------
  // 1. List all Storage objects under the PR's prefix
  // ------------------------------------------------------------------
  // Storage prefix mirrors the RTDB path: prs/{encOwner}/{encRepo}/{number}/
  const storagePrefix =
    `prs/${encodeSegment(owner)}/${encodeSegment(repo)}/${number}`;
  const listRef = storageRef(storage, storagePrefix);

  let listResult;
  try {
    listResult = await listAll(listRef);
  } catch (err) {
    throw new Error(`Failed to list Storage objects for ${owner}/${repo}#${number}: ${err.message}`);
  }

  const blobCount = listResult.items.length;

  if (blobCount === 0) {
    // Check whether the RTDB node exists before calling it a no-op.
    // Either way, attempt the RTDB remove (idempotent — remove on a non-existent path is a no-op).
    await remove(ref(db, prKeyPath(owner, repo, number)));
    console.log(`\nNo artifacts found for ${owner}/${repo}#${number} — nothing to clear.\n`);
    return;
  }

  // ------------------------------------------------------------------
  // 2. Delete each blob
  // ------------------------------------------------------------------
  const deleteResults = await Promise.allSettled(
    listResult.items.map((item) => deleteObject(item))
  );

  // Report any blob deletions that failed (non-fatal for the RTDB step).
  const failedDeletes = deleteResults.filter((r) => r.status === 'rejected');
  if (failedDeletes.length > 0) {
    const reasons = failedDeletes.map((r) => r.reason?.message ?? 'unknown').join('\n  ');
    // Continue to RTDB cleanup anyway — partial cleanup is better than none.
    console.error(
      `Warning: ${failedDeletes.length} blob(s) could not be deleted:\n  ${reasons}`
    );
  }

  // ------------------------------------------------------------------
  // 3. Remove the RTDB subtree
  // ------------------------------------------------------------------
  try {
    await remove(ref(db, prKeyPath(owner, repo, number)));
  } catch (err) {
    throw new Error(
      `Blobs deleted but RTDB metadata removal failed for ${owner}/${repo}#${number}: ${err.message}`
    );
  }

  const successCount = blobCount - failedDeletes.length;
  console.log(
    `\nCleared ${successCount} artifact(s) for ${owner}/${repo}#${number}.` +
    (failedDeletes.length > 0 ? ` (${failedDeletes.length} blob(s) failed — see warnings above)` : '') +
    `\n`
  );
}
