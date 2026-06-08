/**
 * public/firebase-config.js
 *
 * Firebase web app configuration — exported as an ES module for use by all
 * browser-side scripts (home page, per-PR gallery, login page).
 *
 * THESE VALUES ARE NOT SECRETS.
 * Firebase web config is intentionally public — it identifies the project but
 * grants no access on its own. Security is enforced by Firebase Authentication
 * combined with the RTDB Security Rules (database.rules.json) and Cloud Storage
 * Security Rules (storage.rules).
 *
 * HOW TO FILL IN:
 *   1. Open the Firebase console → Project settings → "Your apps" → Web app.
 *   2. If you haven't added a web app yet, click "Add app" → Web.
 *   3. Copy each value from the "firebaseConfig" snippet shown in the console.
 *   4. Replace every "REPLACE_ME" placeholder below with the real values.
 *   5. Also update .firebaserc with the project ID.
 */

export const firebaseConfig = {
  apiKey:        "REPLACE_ME",
  authDomain:    "REPLACE_ME.firebaseapp.com",
  databaseURL:   "https://REPLACE_ME-default-rtdb.firebaseio.com",
  projectId:     "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  appId:         "REPLACE_ME",
};
