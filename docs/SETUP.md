# Setup Checklist — PR Evidence Gallery

Complete these steps in order before running any deploy commands.
All PowerShell commands assume you are in the project root (`C:\Users\danwi\ClaudePhotoVideoAssetsToPr`).

---

## 1. Create the Firebase project on the Blaze plan

1. Go to [https://console.firebase.google.com/](https://console.firebase.google.com/) and click **Add project**.
2. Choose a project name (e.g. `pr-evidence-gallery`). Note the auto-generated **Project ID** — you will need it in steps 3 and 5.
3. Enable Google Analytics if you wish (not required).
4. After the project is created, open **Project settings → Usage and billing** and confirm it is on the **Blaze (pay-as-you-go)** plan.
   - If it is on the Spark plan, click **Modify plan** → Blaze and attach a billing account.
   - **Cloud Storage for Firebase requires the Blaze plan** as of early 2026; Spark returns 402/403 on Storage writes.

---

## 2. Set a GCP budget alert (billing safety net)

Blaze has no hard spend ceiling by default. A budget alert is the real cost safety net.

1. Open the [Google Cloud Console Billing page](https://console.cloud.google.com/billing).
2. Select your billing account → **Budgets & alerts** → **Create budget**.
3. Scope the budget to your Firebase project.
4. Set a **$5 alert threshold** (100% of $5 target) and add your email as a recipient.
5. Optionally add a second alert at **$20** for an early warning of unexpected growth.

> Realistic cost at solo scale is **cents/month** (Storage ~$0.026/GB/mo, egress ~$0.15/GB).

---

## 3. Enable Firebase services

In the Firebase console, enable each service:

### 3a. Realtime Database (RTDB)
1. Left nav → **Realtime Database** → **Create database**.
2. Choose a region (e.g. `us-central1`).
3. Start in **locked mode** (the deploy step will replace the rules).

### 3b. Cloud Storage
1. Left nav → **Storage** → **Get started**.
2. Start in **production mode** (the deploy step will replace the rules).
3. Choose a storage location (same region as RTDB is recommended).

### 3c. Hosting
1. Left nav → **Hosting** → **Get started**.
2. You can skip the optional Firebase CLI setup steps shown in the wizard — the deploy commands below handle it.

### 3d. Authentication
1. Left nav → **Authentication** → **Get started**.
2. Under **Sign-in method**, enable **Email/Password** (the first provider in the list).
3. Leave **Email link (passwordless)** disabled.

---

## 4. Create user accounts by hand

**There is no self-signup.** All accounts are created by an administrator in the Firebase console.

1. Left nav → **Authentication** → **Users** tab → **Add user**.
2. Create one **bot account** for CLI uploads, e.g.:
   - Email: `claude-bot@your-domain.com`
   - Set a strong random password; save it somewhere safe.
3. Create one or more **human reviewer accounts** the same way.

> The bot account credentials (email + password) go into `cli/.env` (gitignored).
> See `cli/.env.example` for the exact variable names.

---

## 5. Local setup

### 5a. Install dependencies (installs firebase-tools locally)

```powershell
npm install
```

This installs `firebase-tools` as a local devDependency so `npm run deploy` works without
a global install. No `npm install -g firebase-tools` required.

### 5b. Log in to Firebase

```powershell
npx firebase login
```

### 5c. Set the project ID

Edit `.firebaserc` and replace the placeholder with your actual project ID:

```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

Or use the Firebase CLI:

```powershell
npx firebase use your-actual-project-id
```

### 5d. Fill in the web app config (root `.env`)

```powershell
Copy-Item .env.example .env
```

Open `.env` and fill in the six `FIREBASE_*` values from the Firebase console:
**Project settings → Your apps → Web app config snippet.**

If you haven't added a Web app yet, click **Add app → Web**, register it, then copy the
`firebaseConfig` values shown. These values are **not secrets** — security is enforced by
Auth + Security Rules.

`public/firebase-config.js` is auto-generated from `.env` before every deploy (see §8).
You can also generate it manually at any time:

```powershell
npm run config
```

### 5e. Fill in the CLI bot credentials (`cli/.env`)

```powershell
Copy-Item cli/.env.example cli/.env
```

Open `cli/.env` and fill in the bot account email, password, and the same Firebase config
values (the CLI uses the client SDK for uploads). See `cli/README.md` for details.

---

## 6. Deploy Security Rules first

```powershell
npm run deploy:rules
```

This deploys `database.rules.json` (RTDB rules) and `storage.rules` (Cloud Storage rules).
Verify in the Firebase console that the rules are live before running any uploads.

> Note: `deploy:rules` does **not** run `npm run config` — it does not need the web config
> and must work even if `.env` is not yet filled in.

---

## 7. Set the Storage object-lifecycle rule (6-month TTL)

Cloud Storage lifecycle rules automatically delete blobs older than 180 days.
This handles the TTL requirement without Cloud Functions.

### Option A — gsutil (PowerShell)

Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) if you haven't
already, then run from the project root:

```powershell
# Save the lifecycle policy to a temporary file
$lifecycleJson = @'
{
  "lifecycle": {
    "rule": [
      {
        "action": { "type": "Delete" },
        "condition": { "age": 180 }
      }
    ]
  }
}
'@
$lifecycleJson | Out-File -Encoding utf8 lifecycle-tmp.json

# Apply it to your bucket (replace YOUR_PROJECT_ID with your actual project ID)
gsutil lifecycle set lifecycle-tmp.json gs://YOUR_PROJECT_ID.appspot.com

# Clean up the temp file
Remove-Item lifecycle-tmp.json
```

### Option B — Firebase / GCP console

1. Open the [GCP Cloud Storage console](https://console.cloud.google.com/storage/browser).
2. Click your bucket → **Lifecycle** tab → **Add a rule**.
3. Action: **Delete object**. Condition: **Age** = `180` days. Save.

---

## 8. Deploy

`npm run deploy` auto-generates `public/firebase-config.js` from `.env` before deploying
(via the `predeploy` npm hook calling `npm run config`).

```powershell
# Deploy everything (rules + hosting) — also auto-runs npm run config first
npm run deploy

# Deploy only hosting (also auto-runs npm run config first)
npm run deploy:hosting
```

After deploy, your gallery will be live at `https://YOUR_PROJECT_ID.web.app`.

---

## 9. Verify

1. Open the Hosting URL: `https://YOUR_PROJECT_ID.web.app`.
2. Sign in with one of the human reviewer accounts you created in step 4.
3. Confirm the gallery loads and the home page is accessible.

---

## Quick reference — npm scripts

| Command | What it does |
|---|---|
| `npm run config` | Generate `public/firebase-config.js` from root `.env` (runs automatically before deploy) |
| `npm run deploy` | Generate config, then deploy all services (rules + hosting) |
| `npm run deploy:hosting` | Generate config, then deploy only Hosting files |
| `npm run deploy:rules` | Deploy only RTDB + Storage rules (no config generation) |
| `npm run emulators` | Generate config, then start the Firebase local emulator suite |
