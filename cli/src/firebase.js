/**
 * cli/src/firebase.js
 *
 * Initialises the Firebase client SDK app and signs in the bot account
 * using Email/Password authentication. Returns the live SDK handles needed
 * by the command modules.
 *
 * Design notes:
 *   - Uses the Firebase CLIENT SDK (firebase npm package), NOT the Admin SDK.
 *     The bot is a normal Email/Password account; least-privilege is enforced
 *     via Security Rules, not Admin bypass.
 *   - Idempotent: guards against double-initialisation so callers can safely
 *     call this multiple times without an "app already exists" error.
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

/**
 * Initialises Firebase and signs in the bot.
 *
 * @param {{
 *   firebaseConfig: object,
 *   botEmail: string,
 *   botPassword: string,
 * }} config - Values from loadConfig().
 *
 * @returns {Promise<{
 *   app: import('firebase/app').FirebaseApp,
 *   auth: import('firebase/auth').Auth,
 *   db: import('firebase/database').Database,
 *   storage: import('firebase/storage').FirebaseStorage,
 * }>}
 */
export async function initFirebase(config) {
  // Guard against double-initialisation (e.g. during tests or hot-reload).
  const app = getApps().length === 0
    ? initializeApp(config.firebaseConfig)
    : getApp();

  const auth    = getAuth(app);
  const db      = getDatabase(app);
  const storage = getStorage(app);

  // Sign the bot in with Email/Password.
  try {
    await signInWithEmailAndPassword(auth, config.botEmail, config.botPassword);
  } catch (err) {
    // Map Firebase auth error codes to friendly messages.
    const code = err?.code ?? '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      throw new Error(
        `Authentication failed: invalid bot credentials.\n` +
        `Check BOT_EMAIL and BOT_PASSWORD in cli/.env.`
      );
    }
    if (code === 'auth/network-request-failed') {
      throw new Error(
        `Authentication failed: network error.\n` +
        `Check your internet connection and FIREBASE_AUTH_DOMAIN in cli/.env.`
      );
    }
    // Re-throw with a generic friendly wrapper for unexpected codes.
    throw new Error(`Authentication failed (${code || 'unknown error'}): ${err.message}`);
  }

  return { app, auth, db, storage };
}
