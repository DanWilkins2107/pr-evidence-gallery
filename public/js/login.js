/**
 * public/js/login.js
 *
 * Handles the login page:
 *  - If the user is already signed in, immediately redirects to the intended
 *    destination (or / if no redirect param is present).
 *  - Renders a sign-in form; on submission calls Firebase
 *    signInWithEmailAndPassword and navigates on success.
 *  - Displays user-friendly error messages on failure.
 */

import { signInWithEmailAndPassword, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { auth } from './firebase-init.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the URL to redirect to after a successful login. */
function getRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get('redirect');
  if (raw) {
    try {
      // Ensure the redirect is a same-origin relative path, not an open redirect.
      const decoded = decodeURIComponent(raw);
      if (decoded.startsWith('/') && !decoded.startsWith('//')) {
        return decoded;
      }
    } catch {
      // fall through to default
    }
  }
  return '/';
}

/**
 * Converts a Firebase Auth error code to a human-readable sentence.
 *
 * @param {string} code - e.g. "auth/wrong-password"
 * @returns {string}
 */
function friendlyError(code) {
  switch (code) {
    case 'auth/invalid-email':
      return 'That doesn\'t look like a valid email address.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Contact the owner.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      // Deliberately vague — don't reveal whether the email exists.
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment and try again.';
    case 'auth/network-request-failed':
      return 'Network error — check your connection and try again.';
    default:
      return `Sign-in failed (${code}). Please try again.`;
  }
}

// ---------------------------------------------------------------------------
// DOM wiring (runs after the module is parsed, so the DOM is ready)
// ---------------------------------------------------------------------------

const form      = /** @type {HTMLFormElement}  */ (document.getElementById('login-form'));
const emailEl   = /** @type {HTMLInputElement}  */ (document.getElementById('email'));
const passEl    = /** @type {HTMLInputElement}  */ (document.getElementById('password'));
const submitBtn = /** @type {HTMLButtonElement} */ (document.getElementById('submit-btn'));
const errorEl   = /** @type {HTMLElement}       */ (document.getElementById('error-msg'));

/** Shows an error string. Pass empty string to clear. */
function showError(msg) {
  errorEl.textContent = msg;
  errorEl.hidden = !msg;
}

// If the user is already signed in, skip the login page entirely.
const unsubscribe = onAuthStateChanged(auth, (user) => {
  unsubscribe();
  if (user) {
    window.location.replace(getRedirectTarget());
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  showError('');

  const email    = emailEl.value.trim();
  const password = passEl.value;

  if (!email || !password) {
    showError('Please enter your email and password.');
    return;
  }

  // Disable the form while the request is in flight.
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in…';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.replace(getRedirectTarget());
  } catch (err) {
    showError(friendlyError(err.code));
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
    passEl.value = '';
    passEl.focus();
  }
});
