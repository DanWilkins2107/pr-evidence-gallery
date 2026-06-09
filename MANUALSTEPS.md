# Manual Steps

The quick, tickable checklist of everything **you** have to do by hand to stand up the
PR Evidence Gallery. Console actions can't be scripted from this repo; the few commands are
included inline so you can work straight down the list.

For the full explanation of each step (rationale, screenshots-level detail, options), see
[`docs/SETUP.md`](docs/SETUP.md). This file is the short version.

All commands assume you are in the project root.

---

## A. Firebase / Google Cloud console (browser)

- [ ] **Create the project** on the **Blaze (pay-as-you-go)** plan — Storage requires Blaze.
      Note the **Project ID**. → [console.firebase.google.com](https://console.firebase.google.com/)
- [ ] **Set a budget alert** at **$5** (optionally a second at $20). Blaze has no hard spend cap;
      this is the safety net. → [Cloud Billing → Budgets & alerts](https://console.cloud.google.com/billing)
- [ ] **Enable Realtime Database** (locked mode — deploy replaces the rules).
- [ ] **Enable Cloud Storage** (production mode — deploy replaces the rules).
- [ ] **Enable Hosting** (skip the CLI wizard; the commands below handle it).
- [ ] **Enable Authentication → Email/Password** (leave passwordless/email-link off).
- [ ] **Add a Web app** (Project settings → Add app → Web) and copy its `firebaseConfig`
      values — you'll paste them into `.env` in step B.
- [ ] **Create accounts by hand** (Authentication → Users → Add user) — *no self-signup*:
  - [ ] one **bot account** for CLI uploads (strong random password — save it)
  - [ ] one or more **human reviewer accounts**

## B. Local config (this repo)

- [ ] `npm install` — installs `firebase-tools` locally (no global install needed).
- [ ] `npx firebase login`
- [ ] Set the project ID: `npx firebase use YOUR_PROJECT_ID` (or edit `.firebaserc`).
- [ ] Config — **one** root `.env` for everything: `Copy-Item .env.example .env`, then fill:
  - [ ] the six `FIREBASE_*` values from the Web app config (step A) — used by the site *and* the CLI
  - [ ] `BOT_EMAIL` / `BOT_PASSWORD` (the bot account from step A) + `GALLERY_BASE_URL` — used by the CLI
  - *(`.env` is already gitignored. See [`cli/README.md`](cli/README.md) for CLI detail.)*

## C. Deploy (from this repo)

- [ ] **Rules first:** `npm run deploy:rules` — deploys RTDB + Storage rules. Confirm they're
      live in the console before any uploads.
- [ ] **Storage TTL lifecycle rule (6-month / 180-day delete)** — set once, via the GCP console
      (Cloud Storage → your bucket → **Lifecycle** → Add rule: *Delete object*, *Age = 180*)
      **or** `gsutil` (exact PowerShell block in [`docs/SETUP.md` §7](docs/SETUP.md)).
- [ ] **Deploy everything:** `npm run deploy` (auto-generates `public/firebase-config.js` from
      `.env` first). Hosting-only: `npm run deploy:hosting`.

## D. Verify

- [ ] Open `https://YOUR_PROJECT_ID.web.app`, sign in as a human account, confirm the gallery loads.
- [ ] (Optional) Test an upload from the CLI — see [`cli/README.md`](cli/README.md).

---

### What's already done for you (no action needed)

Code, security rules, the shared path codec, the CLI, the gallery site, the config generator,
and the npm deploy scripts are all built and on `main`. The list above is the only remaining work,
and all of it needs your Firebase account.
