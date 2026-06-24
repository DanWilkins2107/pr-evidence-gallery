# Robot Event Setup

> **New here? Start with this section.** It walks you through standing up your own
> copy from scratch so you can upload and review **robot run footage** (the rest of
> this README describes the original PR-evidence use case the project grew out of —
> the machinery is identical).

## What you get

A **private, login-only website** where you upload video (and image) footage from
robot runs and watch it back. Footage is grouped as **`robot / batch # run-number`**,
and each run gets its own review page. Nothing is ever public — viewers must sign in
with an account you create by hand.

You drive uploads either with the `pr-evidence` command-line tool or, inside Claude
Code, with the **`robot-run-upload` skill**.

## Important: this repo is code only — everyone runs their own backend

Cloning this repository (even after it's public on GitHub) gives you the **source code
only**. It does **not** connect you to anyone else's gallery, and it is **not** a
ready-to-run install. Each person must:

1. **Create their own Firebase project** (free to start; needs the Blaze plan for Cloud Storage).
2. **Create their own `.env`** with that project's config + a bot account password.
   - `.env` and the generated `public/firebase-config.js` are **gitignored and never committed**,
     so they are not in the repo. There are no shared credentials to inherit.
3. **Deploy the website + rules** to their own Firebase project.

In other words: the *code* is shareable; the *gallery and its data are yours alone* and
stay private behind Firebase Authentication.

## Install — step by step

> Prerequisites: **Node 22+**, a Google account, and (for the Claude skill) **Claude Code**.
> Commands below are PowerShell, run from the repo root unless noted.

### 1. Clone and install dependencies

```powershell
git clone https://github.com/DanWilkins2107/pr-evidence-gallery.git
cd pr-evidence-gallery
npm install          # root deps (includes firebase-tools — no global install needed)
cd cli; npm install; cd ..   # CLI deps
```

### 2. Stand up your Firebase backend

Follow **[docs/SETUP.md](docs/SETUP.md)** end to end. It is the authoritative checklist and covers:

- Creating the Firebase project on the **Blaze** plan + a budget alert (cost is typically cents/month).
- Enabling **Realtime Database**, **Cloud Storage**, **Hosting**, and **Email/Password Authentication**.
- Creating accounts **by hand** (there is no self-signup): one **bot account** for uploads,
  plus one or more **reviewer accounts** for the people who will watch the footage.
- Filling in the single root **`.env`** (`Copy-Item .env.example .env`, then edit) with the
  six `FIREBASE_*` values, the bot `BOT_EMAIL` / `BOT_PASSWORD`, and `GALLERY_BASE_URL`.
- Deploying rules (`npm run deploy:rules`), setting the 6-month storage TTL, and deploying
  the site (`npm run deploy`).

After this step your gallery is live at `https://YOUR_PROJECT_ID.web.app`.

### 3. Put the upload CLI on your PATH

The `robot-run-upload` skill calls a `pr-evidence` command, so link it once:

```powershell
cd cli
npm link        # makes `pr-evidence` available globally
cd ..
pr-evidence --help   # verify it resolves
```

(You can skip `npm link` and call `node ./cli/bin/pr-evidence.js` directly, but the skill expects `pr-evidence` on PATH.)

### 4. Enable the Claude Code skill in the repo where you keep footage

```powershell
cd C:\path\to\your-footage-repo   # any folder/repo you work from in Claude Code
pr-evidence init
```

This writes `.claude/settings.json` pointing Claude Code at **your local clone** of this
repo (by filesystem path). Nothing else is copied. Then, inside Claude Code:

```
/pr-evidence:robot-run-upload
```

The skill asks for the **robot**, **batch**, and **run number**, uploads your footage, and
prints the review URL.

## Upload footage without Claude (plain CLI)

The skill is just a wrapper. You can upload directly, repurposing the CLI's fields
(`--repo` holds `robot/batch`, `--pr` holds the run number):

```powershell
pr-evidence upload ".\runs\rover1-run3.mp4" `
  --repo rover-1/warehouse-2026-06-24 `
  --pr 3 `
  --title "Aisle 4 traverse – onboard cam"
```

It prints the run's gallery URL: `https://YOUR_PROJECT_ID.web.app/pr/rover-1/warehouse-2026-06-24/3`.
Sign in there to review. To replace a run's footage, clear it first:
`pr-evidence clear --pr "rover-1/warehouse-2026-06-24#3"`.

## Field mapping & limits at a glance

| Concept | CLI flag | Example | Notes |
|---|---|---|---|
| Robot + batch | `--repo` | `rover-1/warehouse-2026-06-24` | Exactly one `/`; dots/dashes fine |
| Run number | `--pr` | `3` | Digits only |
| Footage label | `--title` | `"Aisle 4 traverse"` | Required, non-empty |

- **Formats:** `.mp4`, `.webm`, `.png`, `.jpg`, `.jpeg`, `.webp`.
- **Size caps:** video ≤ 50 MB, image ≤ 10 MB. To raise, edit `CONTENT_TYPES` in
  `public/shared/pathCodec.js` and redeploy rules (`npm run deploy:rules`). Note the
  viewer downloads the whole clip to play it — there's no streaming/transcoding.
- **Retention:** the Storage TTL (set in SETUP step 7) auto-deletes footage after 180 days.

---

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

This repo ships a local Claude Code plugin (`agent-plugin/`) that exposes a `pr-evidence` skill. The skill auto-detects the current branch's PR, drives the upload flow, and posts a single gallery link comment on the PR — all without you needing to run CLI commands manually.

**To opt a repo in:**

```powershell
cd C:\projects\my-app    # the consuming repo
pr-evidence init
```

This writes `.claude/settings.json` in that repo, pointing Claude Code at this repo's plugin via `extraKnownMarketplaces` + `enabledPlugins`. Nothing is copied into the consuming repo beyond that one settings file.

**Invoke the skill** inside the consuming repo:

```
/pr-evidence:pr-evidence
```

The skill defers to the consuming repo's `CLAUDE.md` for the evidence policy (what to capture); it only handles the upload + PR comment steps.

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
