# pr-evidence CLI

Command-line tool for uploading and managing PR evidence artifacts in the
[Private PR Evidence Gallery](../DESIGN.md).

---

## Prerequisites

- Node 22+
- A Firebase project configured with Realtime Database, Cloud Storage,
  Hosting, and Email/Password authentication (see DESIGN.md §2).
- A dedicated bot Email/Password account created by hand in the Firebase console.

---

## Install

```bash
cd cli
npm install
```

---

## Configure

Copy `.env.example` to `.env` and fill in all values:

```bash
cp .env.example .env
# then edit cli/.env
```

Variables:

| Variable | Description |
|---|---|
| `FIREBASE_API_KEY` | From Firebase console → Project settings → Web app |
| `FIREBASE_AUTH_DOMAIN` | e.g. `your-project.firebaseapp.com` |
| `FIREBASE_DATABASE_URL` | e.g. `https://your-project-default-rtdb.firebaseio.com` |
| `FIREBASE_PROJECT_ID` | e.g. `your-project` |
| `FIREBASE_STORAGE_BUCKET` | e.g. `your-project.appspot.com` |
| `FIREBASE_APP_ID` | From Firebase console |
| `BOT_EMAIL` | Email of the dedicated upload bot account |
| `BOT_PASSWORD` | Password of the bot account |
| `GALLERY_BASE_URL` | Hosted gallery URL, e.g. `https://your-project.web.app` |

---

## Commands

### Upload an artifact

```bash
node ./bin/pr-evidence.js upload <file> --repo owner/name --pr N --title "..."
```

- `<file>` — path to a local image or video file
  - Allowed: `.png`, `.jpg`, `.jpeg`, `.webp`, `.mp4`, `.webm`
  - Size caps: images up to 10 MB, videos up to 50 MB
- `--repo` — GitHub repository in `owner/name` format
- `--pr` — pull request number (digits only)
- `--title` — required human-readable label for this artifact (non-empty)

On success, prints the per-PR gallery URL.

**Examples:**

```bash
# Upload a desktop screenshot
node ./bin/pr-evidence.js upload ./screenshots/home-desktop.png \
  --repo acme/my-app --pr 123 --title "Home page – desktop 1280px"

# Upload a video recording
node ./bin/pr-evidence.js upload ./recordings/checkout-flow.webm \
  --repo acme/my-app --pr 123 --title "Checkout flow walkthrough"
```

### Clear all artifacts for a PR

```bash
node ./bin/pr-evidence.js clear --pr owner/name#N
```

Deletes **all** Storage blobs and RTDB metadata for the given PR.
Use this before re-uploading a fresh set of evidence (re-review flow).

**Example:**

```bash
node ./bin/pr-evidence.js clear --pr acme/my-app#123
```

### Help

```bash
node ./bin/pr-evidence.js --help
```

---

## Shared codec dependency

This CLI imports `../public/shared/pathCodec.js` — the shared encoding/decoding
helper that is also used by the gallery website. It must not be duplicated.
Both the CLI and the website use this single file so that RTDB paths and
Storage paths can never drift between the uploader and the viewer.

---

## How it works

1. **Upload:** pre-flight checks (file exists, type allowed, size within cap)
   → generate an RTDB `push()` key (the `artifactId`) → upload blob to
   `prs/{encOwner}/{encRepo}/{N}/{artifactId}.{ext}` in Cloud Storage →
   write RTDB metadata at `prs/{encOwner}/{encRepo}/{N}/{artifactId}`.
   Metadata is only written if the blob upload succeeds.

2. **Clear:** list all Storage objects under the PR's prefix → delete each
   blob → remove the RTDB subtree at `prs/{encOwner}/{encRepo}/{N}`.

3. **Auth:** the bot signs in with Email/Password using the Firebase **client**
   SDK. All permissions are enforced by Firebase Security Rules (least privilege).
