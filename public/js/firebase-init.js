/**
 * public/js/firebase-init.js
 *
 * Initialises the Firebase app once and exports the service singletons used
 * by every page in the gallery.  Import from here — never call initializeApp()
 * a second time or you will get "Firebase App named '[DEFAULT]' already exists".
 */

import { initializeApp }       from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth }             from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getDatabase }         from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';
import { getStorage }          from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';

import { firebaseConfig } from '../firebase-config.js';

const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getDatabase(app);
const storage = getStorage(app);

export { app, auth, db, storage };
