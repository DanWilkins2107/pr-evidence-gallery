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
│   └── ...                 # reads the shared root .env (no separate config file)
├── scripts/
│   └── generate-firebase-config.mjs  # Generates public/firebase-config.js from root .env
├── docs/
│   └── SETUP.md            # Step-by-step Firebase project setup checklist
├── .env.example            # Template for the single root .env (web config + CLI bot creds)
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
1. Copy `.env.example` → `.env` (repo root) and fill in the six `FIREBASE_*` values from the Firebase console (Project settings → Your apps → Web app config). This same `.env` also holds the CLI bot credentials (`BOT_*`, `GALLERY_BASE_URL`).
2. Run `npm run config` to generate the file, or just run `npm run deploy` — the config is auto-generated before every deploy.

## Agent skill

This repo ships a local Claude Code plugin (`agent-plugin/`) with two skills, written for autonomous development — the agent invokes them itself, nobody has to ask:

- **`ui-pr-evidence`** — triggers when the agent opens, pushes to, or readies a PR that changes UI code. Holds the capture policy.
- **`pr-evidence`** — the upload step: auto-detects the current branch's PR, uploads the captures, and posts a single gallery link comment on the PR.

**To opt a repo in:**

```powershell
cd C:\projects\my-app    # the consuming repo
pr-evidence init
```

This writes `.claude/settings.json` in that repo, pointing Claude Code at this repo's plugin via `extraKnownMarketplaces` + `enabledPlugins`. Nothing is copied into the consuming repo beyond that one settings file.

### UI PR capture policy

`ui-pr-evidence` holds the capture policy itself, so you don't have to restate it in each
repo's `CLAUDE.md`. You can also run it by hand:

```
/pr-evidence:ui-pr-evidence
```

It checks whether the PR actually touches UI code (inferred from the repo — no fixed
directory; skipping back-end, CLI, CI, DB and docs PRs),
captures every changed view at desktop 1280px and mobile 375px plus a screen recording
for multi-step flows, then hands off to `pr-evidence` for the upload and PR comment.
Captures are ad-hoc (`npx playwright`) and nothing is committed. A consuming repo's own
`CLAUDE.md` evidence policy, if present, overrides these defaults.

**Prerequisites:** `pr-evidence` on PATH (via `npm link` — see [cli/README.md](cli/README.md)) and `gh` authenticated.

---

## Local deploy commands

```powershell
# 1. Install dependencies (includes firebase-tools — no global install needed)
npm install

# 2. Log in to Firebase
npx firebase login

# 3. Fill in the project ID
#    Edit .firebaserc  OR  run:
npx firebase use your-project-id

# 4. Fill in config — one root .env holds web config AND CLI bot credentials
Copy-Item .env.example .env   # then edit .env (FIREBASE_*, BOT_*, GALLERY_BASE_URL)

# 5. Deploy rules first (does not require .env to be filled)
npm run deploy:rules

# 6. Deploy everything (auto-generates public/firebase-config.js from .env first)
npm run deploy
```

See **[docs/SETUP.md](docs/SETUP.md)** for the complete, ordered setup checklist — from creating the Firebase project through deploying rules, setting the Storage lifecycle TTL, and verifying the live site.
