/**
 * public/js/home.js
 *
 * Home page logic:
 *  - Reads the full /prs tree from RTDB and renders a PR list.
 *  - Supports per-row delete and multi-select batch delete.
 *  - Deletion removes BOTH Cloud Storage blobs AND the RTDB node so
 *    metadata is never orphaned.
 */

import { ref, get, remove }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { ref as storageRef, deleteObject }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

import { db, storage }       from './firebase-init.js';
import { requireAuth, wireSignOut } from './auth-guard.js';
import { decodeSegment, prKeyPath } from '../shared/pathCodec.js';

// ---------------------------------------------------------------------------
// Entry point — wait for auth then bootstrap
// ---------------------------------------------------------------------------

requireAuth((user) => {
  wireSignOut(document.getElementById('sign-out-btn'));
  loadPRList();
});

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadPRList() {
  const listEl    = document.getElementById('pr-list');
  const emptyEl   = document.getElementById('empty-state');
  const loadingEl = document.getElementById('loading-state');

  try {
    const snapshot = await get(ref(db, 'prs'));

    loadingEl.hidden = true;

    if (!snapshot.exists()) {
      emptyEl.hidden = false;
      return;
    }

    const prs = []; // { owner, repo, number, artifacts: [{id, storagePath, contentType, title, uploadedAt}] }

    // Walk encOwner → encRepo → number → artifactId using snapshot.forEach to
    // preserve RTDB insertion order (push-key order = chronological).
    snapshot.forEach((ownerSnap) => {
      const owner = decodeSegment(ownerSnap.key);
      ownerSnap.forEach((repoSnap) => {
        const repo = decodeSegment(repoSnap.key);
        repoSnap.forEach((prSnap) => {
          const number    = prSnap.key;
          const artifacts = [];
          prSnap.forEach((artifactSnap) => {
            artifacts.push({ id: artifactSnap.key, ...artifactSnap.val() });
          });
          if (artifacts.length > 0) {
            prs.push({ owner, repo, number, artifacts });
          }
        });
      });
    });

    if (prs.length === 0) {
      emptyEl.hidden = false;
      return;
    }

    renderList(prs, listEl);

  } catch (err) {
    loadingEl.hidden = true;
    showGlobalError(`Failed to load PR list: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderList(prs, listEl) {
  const sectionEl = document.getElementById('pr-section');
  sectionEl.hidden = false;

  listEl.innerHTML = '';

  for (const pr of prs) {
    const row = buildRow(pr);
    listEl.appendChild(row);
  }

  // Wire the "Delete selected" button once the list is built.
  document.getElementById('delete-selected-btn').addEventListener('click', () => {
    deleteSelected(prs);
  });
}

/**
 * Builds a single PR list row element.
 *
 * @param {{ owner: string, repo: string, number: string, artifacts: any[] }} pr
 * @returns {HTMLElement}
 */
function buildRow(pr) {
  const { owner, repo, number, artifacts } = pr;
  const count = artifacts.length;

  // Gallery URL: URL-encode the raw owner/repo segments for the path.
  const galleryUrl = `/pr/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${number}`;
  const label = `${owner}/${repo}#${number}`;
  const artifactLabel = count === 1 ? '1 artifact' : `${count} artifacts`;

  const row = document.createElement('li');
  row.className = 'pr-row';
  row.dataset.owner  = owner;
  row.dataset.repo   = repo;
  row.dataset.number = number;

  row.innerHTML = `
    <label class="pr-row__checkbox-wrap" title="Select for batch delete">
      <input type="checkbox" class="pr-row__checkbox" aria-label="Select ${label}">
    </label>
    <div class="pr-row__info">
      <a class="pr-row__link" href="${galleryUrl}">${escHtml(label)}</a>
      <span class="pr-row__count">${escHtml(artifactLabel)}</span>
    </div>
    <button class="pr-row__delete btn btn--danger" aria-label="Delete ${escHtml(label)}">
      Delete
    </button>
  `;

  row.querySelector('.pr-row__delete').addEventListener('click', () => {
    confirmAndDelete([{ owner, repo, number, artifacts }], () => {
      row.remove();
      checkListEmpty();
    });
  });

  return row;
}

function checkListEmpty() {
  const listEl  = document.getElementById('pr-list');
  const emptyEl = document.getElementById('empty-state');
  if (listEl.children.length === 0) {
    document.getElementById('pr-section').hidden = true;
    emptyEl.hidden = false;
  }
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * Prompts the user then deletes each PR's blobs + RTDB node.
 *
 * @param {{ owner: string, repo: string, number: string, artifacts: any[] }[]} prList
 * @param {() => void} onSuccess - Called after all deletes complete.
 */
async function confirmAndDelete(prList, onSuccess) {
  if (prList.length === 0) return;

  const names = prList.map(p => `${p.owner}/${p.repo}#${p.number}`).join('\n');
  const msg = prList.length === 1
    ? `Delete all evidence for:\n\n${names}\n\nThis cannot be undone.`
    : `Delete evidence for ${prList.length} PRs:\n\n${names}\n\nThis cannot be undone.`;

  if (!window.confirm(msg)) return;

  // Show a global busy indicator while deleting.
  const statusEl = document.getElementById('delete-status');
  statusEl.textContent = 'Deleting…';
  statusEl.hidden = false;

  try {
    await deleteAllPRs(prList);
    onSuccess();
  } catch (err) {
    showGlobalError(`Deletion failed: ${err.message}`);
  } finally {
    statusEl.hidden = true;
    statusEl.textContent = '';
  }
}

/**
 * For each PR: delete every Storage blob, then remove the RTDB node.
 * Blobs are deleted first so we never leave orphaned metadata.
 *
 * @param {{ owner: string, repo: string, number: string, artifacts: any[] }[]} prList
 */
async function deleteAllPRs(prList) {
  for (const { owner, repo, number, artifacts } of prList) {
    // Delete blobs in parallel for speed.
    const blobDeletes = artifacts.map((a) =>
      deleteObject(storageRef(storage, a.storagePath)).catch((err) => {
        // If the blob is already gone (e.g. TTL expiry), that is fine — proceed.
        if (err.code !== 'storage/object-not-found') throw err;
      })
    );
    await Promise.all(blobDeletes);

    // Remove the RTDB node after all blobs are confirmed deleted.
    await remove(ref(db, prKeyPath(owner, repo, number)));
  }
}

/**
 * Collects checked rows and runs confirmAndDelete on them.
 *
 * @param {{ owner: string, repo: string, number: string, artifacts: any[] }[]} allPrs
 */
function deleteSelected(allPrs) {
  const listEl = document.getElementById('pr-list');
  const checked = [...listEl.querySelectorAll('.pr-row__checkbox:checked')];

  if (checked.length === 0) {
    window.alert('No PRs selected. Check the boxes next to the PRs you want to delete.');
    return;
  }

  // Map each checked box back to its PR data by matching data attributes on the row.
  const selected = checked.map((cb) => {
    const row   = cb.closest('.pr-row');
    const owner  = row.dataset.owner;
    const repo   = row.dataset.repo;
    const number = row.dataset.number;
    return allPrs.find(p => p.owner === owner && p.repo === repo && p.number === number);
  }).filter(Boolean);

  confirmAndDelete(selected, () => {
    // Remove the checked rows from the DOM.
    checked.forEach((cb) => cb.closest('.pr-row').remove());
    checkListEmpty();
  });
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showGlobalError(msg) {
  const el = document.getElementById('global-error');
  el.textContent = msg;
  el.hidden = false;
}
