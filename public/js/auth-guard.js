/**
 * public/js/auth-guard.js
 *
 * Auth helpers used by every authenticated page.
 *
 *  requireAuth(onReady)
 *    Subscribes to the Firebase auth state.
 *    - Not signed in  → redirects to /login (preserving the current path as a
 *                        `redirect` query param so login.js can send the user back).
 *    - Signed in      → calls onReady(user) exactly once.
 *
 *  wireSignOut(buttonEl)
 *    Attaches a click handler that calls Firebase signOut and then redirects to /login.
 */

import { signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth } from './firebase-init.js';

/**
 * Redirects to /login if the visitor is not authenticated; otherwise calls
 * `onReady` with the signed-in user object.
 *
 * @param {(user: import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js').User) => void} onReady
 */
export function requireAuth(onReady) {
  // onAuthStateChanged fires once on initial load, so this is the correct hook
  // for an auth gate — as opposed to auth.currentUser which may be null while
  // the SDK is still rehydrating the session from IndexedDB.
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe(); // we only need the first resolved state
    if (!user) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`/login?redirect=${redirect}`);
    } else {
      onReady(user);
    }
  });
}

/**
 * Attaches a click listener to `buttonEl` that signs the current user out and
 * redirects to /login.
 *
 * @param {HTMLElement} buttonEl
 */
export function wireSignOut(buttonEl) {
  buttonEl.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } finally {
      // Always redirect — even if signOut somehow fails, clear the page.
      window.location.replace('/login');
    }
  });
}
