/**
 * public/js/pr.js
 *
 * Per-PR gallery page logic:
 *  - Parses owner/repo/number from the URL path (/pr/{owner}/{repo}/{number}).
 *  - Loads artifact metadata from RTDB.
 *  - Resolves each artifact's download URL from Cloud Storage.
 *  - Renders a responsive grid of tiles.
 *  - Opens a lightbox on tile click.
 *  - Provides a "Delete all for this PR" button.
 */

import { ref, get, remove }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { ref as storageRef, getDownloadURL, deleteObject }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

import { db, storage }          from './firebase-init.js';
import { requireAuth, wireSignOut } from './auth-guard.js';
import { decodeSegment, prKeyPath, isVideo }
  from '../shared/pathCodec.js';
import { createLightbox }       from './lightbox.js';

// ---------------------------------------------------------------------------
// URL parsing
// ---------------------------------------------------------------------------

/**
 * Parses the PR identity from the current pathname.
 * Pathname format: /pr/{urlEncodedOwner}/{urlEncodedRepo}/{number}
 *
 * The URL segments carry raw (URL-encoded) names; we decodeURIComponent them
 * to get the raw owner/repo, then use encodeSegment (via prKeyPath) for RTDB.
 *
 * @returns {{ owner: string, repo: string, number: string } | null}
 */
function parsePRFromURL() {
  // Strip leading slash and split.
  const parts = window.location.pathname.replace(/^\//, '').split('/');
  // Expected: ['pr', owner, repo, number]
  if (parts.length < 4 || parts[0] !== 'pr') return null;

  try {
    const owner  = decodeURIComponent(parts[1]);
    const repo   = decodeURIComponent(parts[2]);
    const number = parts[3];
    if (!owner || !repo || !number || !/^\d+$/.test(number)) return null;
    return { owner, repo, number };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

requireAuth(() => {
  wireSignOut(document.getElementById('sign-out-btn'));

  const pr = parsePRFromURL();
  if (!pr) {
    showError('Invalid PR URL. Could not parse owner, repo, or PR number from the path.');
    return;
  }

  // Populate static header fields immediately (no async needed).
  document.getElementById('pr-title').textContent =
    `${pr.owner}/${pr.repo} #${pr.number}`;
  document.title = `${pr.owner}/${pr.repo} #${pr.number} — Evidence Gallery`;

  loadGallery(pr);
});

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadGallery(pr) {
  const loadingEl = document.getElementById('loading-state');
  const emptyEl   = document.getElementById('empty-state');
  const gridEl    = document.getElementById('artifact-grid');
  const deleteBtn = document.getElementById('delete-pr-btn');

  try {
    const snapshot = await get(ref(db, prKeyPath(pr.owner, pr.repo, pr.number)));

    loadingEl.hidden = true;

    if (!snapshot.exists()) {
      emptyEl.hidden = false;
      return;
    }

    // Collect artifacts in push-key order (snapshot.forEach preserves order).
    const artifacts = [];
    snapshot.forEach((snap) => {
      artifacts.push({ id: snap.key, ...snap.val() });
    });

    if (artifacts.length === 0) {
      emptyEl.hidden = false;
      return;
    }

    // Resolve all download URLs in parallel.  A 404/expired blob returns null
    // rather than crashing — the tile will show a broken-image placeholder.
    const resolvedArtifacts = await resolveURLs(artifacts);

    renderGrid(resolvedArtifacts, gridEl);

    // Wire the delete button now that we have the artifact list.
    deleteBtn.hidden = false;
    deleteBtn.addEventListener('click', () => {
      deleteAllForPR(pr, resolvedArtifacts);
    });

  } catch (err) {
    loadingEl.hidden = true;
    showError(`Failed to load gallery: ${err.message}`);
  }
}

/**
 * Resolves download URLs for all artifacts, returning an enriched array.
 * If a blob is missing (404 / TTL-expired), the artifact gets url = null.
 *
 * @param {any[]} artifacts
 * @returns {Promise<Array<{url: string|null} & typeof artifacts[0]>>}
 */
async function resolveURLs(artifacts) {
  return Promise.all(
    artifacts.map(async (a) => {
      try {
        const url = await getDownloadURL(storageRef(storage, a.storagePath));
        return { ...a, url };
      } catch (err) {
        // storage/object-not-found = TTL-expired orphan; render a placeholder.
        if (err.code === 'storage/object-not-found') {
          return { ...a, url: null };
        }
        // Other errors (network etc.) — still degrade gracefully.
        console.warn(`Could not resolve URL for artifact ${a.id}:`, err);
        return { ...a, url: null };
      }
    })
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Renders the artifact grid and wires up the lightbox.
 *
 * @param {Array<{ id: string, title: string, contentType: string, url: string|null }>} artifacts
 * @param {HTMLElement} gridEl
 */
function renderGrid(artifacts, gridEl) {
  gridEl.innerHTML = '';

  // Prepare the lightbox with the resolved artifact list.
  const lb = createLightbox(
    artifacts.map(a => ({ title: a.title, contentType: a.contentType, url: a.url }))
  );

  artifacts.forEach((artifact, idx) => {
    const tile = buildTile(artifact, idx, artifacts.length);
    tile.addEventListener('click', () => lb.open(idx));
    gridEl.appendChild(tile);
  });

  gridEl.hidden = false;
}

/**
 * Builds a single grid tile element.
 *
 * Images → thumbnail <img> with lazy loading.
 * Videos → title text + video icon (no inline preview per spec).
 *
 * @param {{ id: string, title: string, contentType: string, url: string|null }} artifact
 * @param {number} idx      - 0-based position (used to derive display number).
 * @param {number} total    - total artifact count.
 * @returns {HTMLElement}
 */
function buildTile(artifact, idx, total) {
  const { title, contentType, url } = artifact;

  // Derive a display number per spec — "Image 3" / "Video 2" — never stored.
  const typeLabel  = isVideo(contentType) ? 'Video' : 'Image';
  const displayNum = idx + 1;

  const tile = document.createElement('button');
  tile.className = 'tile';
  tile.setAttribute('type', 'button');
  tile.setAttribute('aria-label', `Open ${typeLabel} ${displayNum}: ${title}`);

  if (isVideo(contentType)) {
    tile.classList.add('tile--video');
    tile.innerHTML = `
      <div class="tile__video-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
          <path d="M8 5v14l11-7z"/>
        </svg>
      </div>
      <div class="tile__label">${escHtml(typeLabel)} ${displayNum}</div>
      <div class="tile__title">${escHtml(title)}</div>
    `;
  } else if (!url) {
    // Orphaned / expired blob — show a broken-image placeholder tile.
    tile.classList.add('tile--broken');
    tile.innerHTML = `
      <div class="tile__broken-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="currentColor" width="40" height="40">
          <path d="M21 5v6.59l-3-3.01-4 4.01-4-4-4 3.99L2 9V5a2 2 0 0 1 2-2h15a2 2 0 0 1 2 2zm-3 6.42 3 3.01V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6.58l4-3.99 4 4 4-4.01 4 4.01z"/>
        </svg>
      </div>
      <div class="tile__label">${escHtml(typeLabel)} ${displayNum}</div>
      <div class="tile__title">${escHtml(title)}</div>
      <div class="tile__expired">Unavailable</div>
    `;
  } else {
    tile.classList.add('tile--image');
    tile.innerHTML = `
      <img
        src="${escHtml(url)}"
        alt="${escHtml(title)}"
        loading="lazy"
        class="tile__img"
      >
      <div class="tile__label">${escHtml(typeLabel)} ${displayNum}</div>
      <div class="tile__title">${escHtml(title)}</div>
    `;
  }

  return tile;
}

// ---------------------------------------------------------------------------
// Deletion
// ---------------------------------------------------------------------------

/**
 * Prompts the user then deletes all blobs + RTDB node for this PR.
 * On success, redirects to the home page.
 *
 * @param {{ owner: string, repo: string, number: string }} pr
 * @param {Array<{ storagePath: string, url: string|null }>} artifacts
 */
async function deleteAllForPR(pr, artifacts) {
  const label = `${pr.owner}/${pr.repo}#${pr.number}`;
  const msg = `Delete ALL evidence for ${label}?\n\nThis will permanently delete ${artifacts.length} artifact(s) and cannot be undone.`;

  if (!window.confirm(msg)) return;

  const deleteBtn = document.getElementById('delete-pr-btn');
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Deleting…';

  try {
    // Delete all blobs first.
    const blobDeletes = artifacts.map((a) =>
      deleteObject(storageRef(storage, a.storagePath)).catch((err) => {
        if (err.code !== 'storage/object-not-found') throw err;
        // Already gone (TTL) — that is fine.
      })
    );
    await Promise.all(blobDeletes);

    // Then remove the RTDB node.
    await remove(ref(db, prKeyPath(pr.owner, pr.repo, pr.number)));

    window.location.replace('/');

  } catch (err) {
    showError(`Deletion failed: ${err.message}`);
    deleteBtn.disabled = false;
    deleteBtn.textContent = 'Delete all for this PR';
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.hidden = false;
  document.getElementById('loading-state').hidden = true;
}
