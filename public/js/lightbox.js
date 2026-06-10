/**
 * public/js/lightbox.js
 *
 * Zoomable, swipeable lightbox built on PhotoSwipe v5.
 *
 * Usage (unchanged from the previous hand-rolled version):
 *   import { createLightbox } from './lightbox.js';
 *
 *   const lb = createLightbox(artifacts);  // artifacts = [{title, contentType, url}]
 *   lb.open(index);                        // open at the given index
 *
 * Features:
 *  - Images: fit-to-screen, then pinch-zoom toward your fingers + drag to pan
 *    (double-tap / double-click also toggles zoom). This is the key mobile win —
 *    the image fills the screen and you can inspect detail.
 *  - Swipe left / right (or arrow keys) to step between artifacts.
 *  - Swipe down (or click the backdrop / Esc) to close.
 *  - Video support (native <video controls>) and a placeholder slide for
 *    orphaned / expired blobs.
 *  - "N of M" counter (PhotoSwipe built-in) and a title caption.
 *
 * PhotoSwipe is loaded as an ES module from the jsDelivr CDN, mirroring how the
 * app already loads Firebase from a CDN. The matching stylesheet
 * (photoswipe.css) is included in pr.html.
 */

import PhotoSwipeLightbox from 'https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe-lightbox.esm.min.js';
import PhotoSwipe        from 'https://cdn.jsdelivr.net/npm/photoswipe@5/dist/photoswipe.esm.min.js';

// Fallback pixel size used when an image's real dimensions can't be read
// (e.g. an expired URL). PhotoSwipe needs *some* dimensions to lay a slide out.
const FALLBACK_W = 1600;
const FALLBACK_H = 1200;

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
  // Build the PhotoSwipe data source — one slide per artifact.
  //
  // Images carry src + (lazily-filled) width/height. Videos and placeholders
  // are rendered as custom HTML slides (non-zoomable, centred).
  // ---------------------------------------------------------------------------

  const items = artifacts.map((art) => {
    const alt = art.title || '';
    if (!art.url) {
      return { _kind: 'placeholder', html: placeholderHtml(), alt };
    }
    if (isVideo(art.contentType)) {
      return { _kind: 'video', html: videoHtml(art.url), alt };
    }
    // Image — width/height are filled in by ensureDims() before first paint.
    return { _kind: 'image', src: art.url, width: 0, height: 0, alt };
  });

  const lightbox = new PhotoSwipeLightbox({
    dataSource: items,
    pswpModule: PhotoSwipe,
    bgOpacity: 0.92,
    // Let users zoom well past 1:1 to read fine detail in screenshots.
    maxZoomLevel: 4,
    // Smoother momentum panning on touch.
    pinchToClose: false,
  });

  // Title caption pinned to the bottom of the viewport.
  lightbox.on('uiRegister', () => {
    lightbox.pswp.ui.registerElement({
      name: 'caption',
      order: 9,
      isButton: false,
      appendTo: 'root',
      onInit: (el, pswp) => {
        el.className = 'pswp__caption';
        const update = () => {
          const text = pswp.currSlide?.data?.alt || '';
          el.textContent = text;
          el.style.display = text ? '' : 'none';
        };
        pswp.on('change', update);
        update();
      },
    });
  });

  // Stop any playing <video> when leaving its slide or closing the lightbox.
  lightbox.on('contentDeactivate', ({ content }) => {
    content?.element?.querySelector?.('video')?.pause();
  });
  lightbox.on('close', () => {
    document.querySelector('.pswp video')?.pause();
  });

  lightbox.init();

  // ---------------------------------------------------------------------------
  // Dimension preloading
  //
  // PhotoSwipe needs real pixel dimensions to fit an image to the screen and to
  // compute zoom levels. The grid already rendered every image at the same URL,
  // so the browser cache usually makes this resolve instantly. We kick off all
  // probes up front, and open() additionally awaits the slides it needs.
  // ---------------------------------------------------------------------------

  const dimProbes = new Map();

  function ensureDims(index) {
    const item = items[index];
    if (!item || item._kind !== 'image' || item.width) return Promise.resolve();
    if (dimProbes.has(index)) return dimProbes.get(index);

    const probe = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        item.width  = img.naturalWidth  || FALLBACK_W;
        item.height = img.naturalHeight || FALLBACK_H;
        resolve();
      };
      img.onerror = () => {
        item.width  = FALLBACK_W;
        item.height = FALLBACK_H;
        resolve();
      };
      img.src = item.src;
    });
    dimProbes.set(index, probe);
    return probe;
  }

  // Warm every image's dimensions immediately (fire-and-forget). By the time the
  // user clicks a tile these are almost always resolved from cache.
  items.forEach((_, i) => ensureDims(i));

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  async function open(index) {
    // Guarantee the opening slide and its immediate neighbours are sized before
    // the first paint, so the image appears correctly fitted rather than
    // snapping into place after load.
    await Promise.all([
      ensureDims(index),
      ensureDims(index - 1),
      ensureDims(index + 1),
    ]);
    lightbox.loadAndOpen(index);
  }

  function close() {
    lightbox.pswp?.close();
  }

  return { open, close };
}

// ---------------------------------------------------------------------------
// Custom slide markup
// ---------------------------------------------------------------------------

function videoHtml(url) {
  return `
    <div class="pswp-custom">
      <video class="pswp-custom__video" controls preload="metadata" src="${escAttr(url)}"></video>
    </div>
  `;
}

function placeholderHtml() {
  return `
    <div class="pswp-custom">
      <div class="pswp-custom__placeholder">Media unavailable (expired or deleted).</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function isVideo(ct) {
  return ct === 'video/mp4' || ct === 'video/webm';
}

function escAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
