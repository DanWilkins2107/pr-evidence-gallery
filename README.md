# Robot Event Setup

> **New here? Start with this section.** It explains how to watch robot-run footage and
> how the robot uploads it. (The rest of this README documents the original PR-evidence
> use case the project grew out of — the machinery is identical.)

## How it works — one shared backend

There is **one** Firebase backend (the owner's), already deployed and live. You do **not**
stand up your own — everyone shares the same private gallery. Footage is grouped as
**`robot / batch # run-number`**, and each run gets its own review page. Nothing is ever
public — every viewer signs in with an account the owner creates by hand.

There are two roles, with very different setup:

| Role | Who | What they need |
|---|---|---|
| **Viewer** | People reviewing runs | A login account (made for them) + the URL. **Nothing to install.** |
| **Uploader** | The robot car (or the owner via Claude) | Node + the CLI + the shared config. Pushes footage. |

> The Firebase project, the deployed site, and the accounts are all managed by the owner
> following **[docs/SETUP.md](docs/SETUP.md)**. Most people never touch that.

## Viewers — zero install

1. Ask the owner to create you an account (Firebase console → Authentication → Add user).
2. Open the gallery URL (e.g. `https://YOUR_PROJECT_ID.web.app`) and sign in.
3. Browse to a run and watch. Videos play in the lightbox with pinch-zoom/pan on mobile.

That's the whole setup. No clone, no `.env`, no CLI.

## Uploader — the robot car

The robot records footage (`.mp4`/`.webm`) and uploads each clip with the `pr-evidence`
CLI. It needs three things once: **Node 22+**, the **CLI**, and the **shared config**.

### 1. Get the CLI onto the device

```bash
git clone https://github.com/DanWilkins2107/pr-evidence-gallery.git
cd pr-evidence-gallery/cli
npm install
npm link            # puts `pr-evidence` on PATH (or call ./bin/pr-evidence.js directly)
```

### 2. Provide the shared config (the owner sends this privately)

The CLI needs nine values: the six `FIREBASE_*`, the shared bot account
`BOT_EMAIL` / `BOT_PASSWORD`, and `GALLERY_BASE_URL`. **The owner sends these to you
privately** — they are never committed to the repo (`.env` is gitignored).

You can supply them **either** way — pick one:

- **A `.env` file at the repo root** — simplest. Drop the file the owner sends you at
  `pr-evidence-gallery/.env` (same format as [`.env.example`](.env.example)). Done.
- **Real environment variables** — best for a headless robot. Set the nine vars in the
  robot's environment (systemd unit, Docker, or shell profile). No file in the repo needed —
  environment variables take precedence over any `.env`. For example, in a systemd unit:

  ```ini
  [Service]
  Environment=FIREBASE_API_KEY=...
  Environment=FIREBASE_AUTH_DOMAIN=...
  Environment=FIREBASE_DATABASE_URL=...
  Environment=FIREBASE_PROJECT_ID=...
  Environment=FIREBASE_STORAGE_BUCKET=...
  Environment=FIREBASE_APP_ID=...
  Environment=BOT_EMAIL=...
  Environment=BOT_PASSWORD=...
  Environment=GALLERY_BASE_URL=https://YOUR_PROJECT_ID.web.app
  ```

### 3. Upload a clip

After each run the robot runs one command per clip (`--repo` holds `robot/batch`,
`--pr` holds the run number):

```bash
pr-evidence upload ./runs/run3-onboard.mp4 \
  --repo rover-1/warehouse-2026-06-24 \
  --pr 3 \
  --title "Aisle 4 traverse - onboard cam"
```

It prints the run's gallery URL, e.g.
`https://YOUR_PROJECT_ID.web.app/pr/rover-1/warehouse-2026-06-24/3`. Viewers open that and
sign in. To replace a run's footage, clear it first:
`pr-evidence clear --pr "rover-1/warehouse-2026-06-24#3"`.

## Owner — uploading manually via Claude Code

If you (the owner) want to upload footage by hand from Claude Code instead of from the
robot, wire the skill into whatever repo you work from:

```powershell
cd C:\path\to\your-footage-repo
pr-evidence init        # writes .claude/settings.json pointing at your local clone
```

Then invoke it in Claude Code:

```
/pr-evidence:robot-run-upload
```

The skill asks for the **robot**, **batch**, and **run number**, uploads your footage, and
prints the review URL. (This needs the same shared config from step 2 above present locally.)

## Security note — the shared bot account

Everyone who uploads shares **one** bot account. Anyone with that `BOT_PASSWORD` can upload
and delete footage, so only put it where you trust the device/person (the robot, your own
machine). To revoke access you rotate the bot password in the Firebase console and re-issue
it — there is no per-uploader credential. Viewer accounts are separate and can be disabled
individually.

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

### Before every UI PR

The plugin also ships a `ui-pr-evidence` skill that holds the capture policy itself, so
you don't have to restate it in each repo's `CLAUDE.md`:

```
/pr-evidence:ui-pr-evidence
```

It checks whether the PR actually touches UI code (skipping CLI, CI, DB and docs PRs),
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
