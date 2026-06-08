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
2. You can skip the optional Firebase CLI setup steps shown in the wizard — the CLI agent handles that.

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
> See `cli/.env.example` (created by the CLI agent) for the exact variable names.

---

## 5. Fill in project identifiers

### 5a. `.firebaserc` — project alias
Open `.firebaserc` and replace `REPLACE_WITH_FIREBASE_PROJECT_ID` with your actual project ID:

```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

### 5b. `public/firebase-config.js` — web app config
1. In the Firebase console → **Project settings** → **Your apps** section.
2. If you haven't added a Web app yet, click **Add app** → Web, give it a nickname (e.g. `gallery`), and register it.
3. Copy each value from the displayed `firebaseConfig` object.
4. Open `public/firebase-config.js` and replace every `REPLACE_ME` placeholder.

---

## 6. Set the Storage object-lifecycle rule (6-month TTL)

Cloud Storage lifecycle rules automatically delete blobs older than 180 days.
This replaces the need for Cloud Functions.

### Option A — gsutil (PowerShell)

Install the [Google Cloud SDK](https://cloud.google.com/sdk/docs/install) if you haven't already, then:

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

## 7. Install Firebase CLI (if not already installed)

```powershell
npm install -g firebase-tools
firebase login
```

---

## 8. Deploy Security Rules

```powershell
npm run deploy:rules
```

This deploys `database.rules.json` (RTDB rules) and `storage.rules` (Cloud Storage rules).
Verify in the Firebase console that the rules are live before running any uploads.

---

## 9. Deploy Hosting

```powershell
npm run deploy:hosting
```

This deploys the `public/` directory to Firebase Hosting.
Your gallery will be live at `https://YOUR_PROJECT_ID.web.app`.

---

## 10. (Optional) Deploy everything at once

```powershell
npm run deploy
```

Deploys database rules, storage rules, and hosting in one command.

---

## 11. Set up the CLI bot credentials

See `cli/.env.example` (created by the CLI agent) for the required environment variables.
Copy it to `cli/.env` (gitignored) and fill in the bot account email, password,
and Firebase config values.

---

## Quick reference — npm scripts

| Command | What it does |
|---|---|
| `npm run deploy` | Deploy all services (rules + hosting) |
| `npm run deploy:hosting` | Deploy only the Hosting files |
| `npm run deploy:rules` | Deploy only RTDB + Storage rules |
| `npm run emulators` | Start the Firebase local emulator suite |
