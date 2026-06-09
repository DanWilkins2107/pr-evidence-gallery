# PR Evidence Gallery

A standalone Firebase project for attaching screenshots and videos to GitHub pull requests. The owner — and Claude, via a CLI wrapper — upload evidence; reviewers view it on a private, authenticated website. Nothing is ever publicly accessible. Authentication is Email/Password only; accounts are created by hand in the Firebase console (no self-signup).

## Repository layout

```
pr-evidence-gallery/
├── public/                 # Firebase Hosting root — the gallery website
│   ├── shared/
│   │   └── pathCodec.js    # Shared encode/decode helper (see note below)
│   ├── firebase-config.js  # GENERATED — do not edit by hand (see below)
│   ├── index.html          # Home page — lists all PRs with evidence
│   ├── pr.html             # Per-PR gallery page — grid + lightbox
│   └── login.html          # Login page — email/password
├── cli/                    # Upload CLI tool — `upload` and `clear` commands
│   ├── package.json
│   ├── .env.example        # Template for cli/.env (bot credentials + Firebase config)
│   └── ...
├── scripts/
│   └── generate-firebase-config.mjs  # Generates public/firebase-config.js from root .env
├── docs/
│   └── SETUP.md            # Step-by-step Firebase project setup checklist
├── .env.example            # Template for root .env (web app Firebase config)
├── database.rules.json     # Firebase RTDB security rules
├── storage.rules           # Cloud Storage security rules
├── firebase.json           # Firebase project service config
├── .firebaserc             # Firebase project alias (fill in project ID)
└── package.json            # Root package (scripts for deploy / emulators)
```

### The shared codec

`public/shared/pathCodec.js` is imported **directly by both the CLI and the website**. It is the single source of truth for:

- Percent-encoding RTDB key segments (Firebase RTDB keys cannot contain `.`, `$`, `#`, `[`, `]`, `/`)
- Building RTDB paths and Cloud Storage object paths
- The allowed content-type registry (types, extensions, size caps)

Because both sides use the exact same file, RTDB paths written by the CLI and read by the browser can never drift.

### Web app config (`public/firebase-config.js`)

`public/firebase-config.js` is **generated** — do not edit it by hand and do not commit it.
It is produced from root `.env` by `scripts/generate-firebase-config.mjs` and is gitignored.

To set it up:
1. Copy `.env.example` → `.env` (repo root) and fill in the six `FIREBASE_*` values from the Firebase console (Project settings → Your apps → Web app config).
2. Run `npm run config` to generate the file, or just run `npm run deploy` — the config is auto-generated before every deploy.

## Local deploy commands

```powershell
# 1. Install dependencies (includes firebase-tools — no global install needed)
npm install

# 2. Log in to Firebase
npx firebase login

# 3. Fill in the project ID
#    Edit .firebaserc  OR  run:
npx firebase use your-project-id

# 4. Fill in web config
Copy-Item .env.example .env   # then edit .env with your Firebase values

# 5. Fill in CLI bot credentials
Copy-Item cli/.env.example cli/.env   # then edit cli/.env

# 6. Deploy rules first (does not require .env to be filled)
npm run deploy:rules

# 7. Deploy everything (auto-generates public/firebase-config.js from .env first)
npm run deploy
```

See **[docs/SETUP.md](docs/SETUP.md)** for the complete, ordered setup checklist — from creating the Firebase project through deploying rules, setting the Storage lifecycle TTL, and verifying the live site.
