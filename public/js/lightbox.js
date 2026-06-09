/**
 * public/js/lightbox.js
 *
 * A self-contained, reusable lightbox module.
 *
 * Usage:
 *   import { createLightbox } from './lightbox.js';
 *
 *   const lb = createLightbox(artifacts);  // artifacts = [{title, contentType, url}]
 *   lb.open(index);                        // open at the given index
 *
 * Features:
 *  - Image and video support (video gets native <video controls>).
 *  - Click backdrop to close.
 *  - Esc key to close; ← / → arrow keys to step.
 *  - Touch swipe (left / right) to step on mobile.
 *  - "N of M" position counter.
 *  - Graceful: if a URL is null/undefined a placeholder message is shown.
 */

/**
 * @typedef {{ title: string, contentType: string, url: string | null }} LightboxArtifact
 */

/**
 * Creates and mounts a lightbox for the given artifacts array.
 *
 * @param {LightboxArtifact[]} artifacts
 * @returns {{ open: (index: number) => void, close: () => void }}
 */
export function createLightbox(artifacts) {
  // ---------------------------------------------------------------------------
  // Build DOM
  // ---------------------------------------------------------------------------

  const overlay = document.createElement('div');
  overlay.className = 'lb-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Media lightbox');
  overlay.hidden = true;

  overlay.innerHTML = `
    <div class="lb-backdrop"></div>
    <div class="lb-panel">
      <div class="lb-header">
        <span class="lb-counter" aria-live="polite"></span>
        <button class="lb-close" aria-label="Close lightbox">&times;</button>
      </div>
      <div class="lb-media-wrap">
        <button class="lb-nav lb-nav--prev" aria-label="Previous">&#8592;</button>
        <div class="lb-media"></div>
        <button class="lb-nav lb-nav--next" aria-label="Next">&#8594;</button>
      </div>
      <div class="lb-title"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const backdropEl = overlay.querySelector('.lb-backdrop');
  const counterEl  = overlay.querySelector('.lb-counter');
  const closeBtn   = overlay.querySelector('.lb-close');
  const mediaEl    = overlay.querySelector('.lb-media');
  const titleEl    = overlay.querySelector('.lb-title');
  const prevBtn    = overlay.querySelector('.lb-nav--prev');
  const nextBtn    = overlay.querySelector('.lb-nav--next');

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let currentIndex = 0;

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function render(index) {
    currentIndex = index;
    const art = artifacts[index];
    const total = artifacts.length;

    counterEl.textContent = `${index + 1} of ${total}`;
    titleEl.textContent   = art.title || '';

    // Clear previous media (stops any playing video).
    mediaEl.innerHTML = '';

    if (!art.url) {
      // Orphaned / expired blob — show a placeholder.
      const placeholder = document.createElement('div');
      placeholder.className = 'lb-placeholder';
      placeholder.textContent = 'Media unavailable (expired or deleted).';
      mediaEl.appendChild(placeholder);
    } else if (isVideo(art.contentType)) {
      const video = document.createElement('video');
      video.controls = true;
      video.preload  = 'metadata';
      video.src      = art.url;
      video.className = 'lb-video';
      mediaEl.appendChild(video);
    } else {
      const img = document.createElement('img');
      img.src = art.url;
      img.alt = art.title || 'Gallery image';
      img.className = 'lb-image';
      mediaEl.appendChild(img);
    }

    // Show/hide nav arrows.
    prevBtn.hidden = total <= 1;
    nextBtn.hidden = total <= 1;
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === total - 1;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  function stepBy(delta) {
    const next = currentIndex + delta;
    if (next >= 0 && next < artifacts.length) {
      render(next);
    }
  }

  // ---------------------------------------------------------------------------
  // Open / close
  // ---------------------------------------------------------------------------

  let previousFocus = null;

  function open(index) {
    previousFocus = document.activeElement;
    render(index);
    overlay.hidden = false;
    document.body.classList.add('lb-open');
    closeBtn.focus();
    document.addEventListener('keydown', handleKeyDown);
  }

  function close() {
    overlay.hidden = true;
    document.body.classList.remove('lb-open');
    mediaEl.innerHTML = ''; // stop video playback
    document.removeEventListener('keydown', handleKeyDown);
    if (previousFocus) previousFocus.focus();
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function handleKeyDown(e) {
    switch (e.key) {
      case 'Escape':      close();        break;
      case 'ArrowLeft':   stepBy(-1);     break;
      case 'ArrowRight':  stepBy(+1);     break;
    }
  }

  closeBtn.addEventListener('click', close);
  backdropEl.addEventListener('click', close);
  prevBtn.addEventListener('click', () => stepBy(-1));
  nextBtn.addEventListener('click', () => stepBy(+1));

  // ---------------------------------------------------------------------------
  // Touch swipe support
  // ---------------------------------------------------------------------------

  let touchStartX = null;

  overlay.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
  }, { passive: true });

  overlay.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX;
    touchStartX = null;
    const SWIPE_THRESHOLD = 50; // px
    if (delta < -SWIPE_THRESHOLD) stepBy(+1);
    if (delta >  SWIPE_THRESHOLD) stepBy(-1);
  }, { passive: true });

  // ---------------------------------------------------------------------------
  // Exports
  // ---------------------------------------------------------------------------

  return { open, close };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isVideo(ct) {
  return ct === 'video/mp4' || ct === 'video/webm';
}
