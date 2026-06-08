# Private PR Evidence Gallery — Design

A standalone Firebase project for attaching screenshots and videos to a specific GitHub PR.
The owner — and Claude, via a CLI wrapper — upload evidence; reviewers view it on a private,
authenticated website. **Nothing is ever publicly accessible.** This is an independent project,
not part of any consuming repo.

This document is the build spec produced by a full design grill. Every decision below is locked
unless marked *deferred*.

---

## 1. Scope & non-goals

**In scope:** a generic capability — upload + storage + private gallery — keyed on `owner/repo#number`.

**Explicitly out of scope (each consuming project decides its own):**
- *Evidence policy* — what to capture (screenshots vs video, which viewports/scenarios). Lives in
  the consuming project's `CLAUDE.md`/skill.
- *No CI merge-gate, no PR template, no enforcement.*
- *PR comment posting* is **not** done by the CLI (see §9).

---

## 2. Stack

| Service | Role |
|---|---|
| Realtime Database (RTDB) | Metadata / PR→artifact index |
| Cloud Storage | The actual image/video files |
| Hosting | The gallery website |
| Authentication | Email/Password only |

**No Cloud Functions.** Every requirement below is met with these four services plus native
Storage features.

**Billing:** Cloud Storage for Firebase **requires the Blaze (pay-as-you-go) plan** as of
2026-02-03 (Spark returns 402/403 on Storage). So the project must be on Blaze with a billing
account attached.

- Realistic cost at solo scale: **cents/month** (storage ~$0.026/GB/mo, egress ~$0.15/GB).
- **Setup checklist item:** set a Google Cloud **budget alert at $5** (and optionally $20). This is
  the real cost safety net — Blaze has no hard spend ceiling by default.

---

## 3. Auth & access model

- **Email/Password only. No self-signup.** Login page is just email + password plus a note
  ("Contact the owner for access"). Accounts are created **by hand** in the Firebase console.
- **One dedicated bot account** for CLI uploads, using the **client SDK** (not Admin SDK). Creds
  (bot email+password, or a cached refresh token) live in a **gitignored** local config / env var.
  Least-privilege: the bot can only do what Security Rules permit.
- **Every authenticated account (bot + humans) gets full read / write / delete.** Rationale: an
  agent that uploaded broken/outdated evidence must be able to clean up after itself, so delete
  can't be a human-only privilege.
- **Reviewers currently see all PRs** (the home page lists everything). Acceptable for now; accounts
  are hand-created and trusted. *Reviewer-scoping is a future add* — it would only tighten the read
  rule, no data-model impact.

---

## 4. Data model

### RTDB tree
```
/prs/{owner}/{repo}/{number}/{artifactId} = { metadata }
```
- **Nested**, mirroring the gallery URL `/pr/owner/repo/123`.
- `owner` and `repo` segments are **sanitized** (RTDB keys cannot contain `.`, `#`, `$`, `[`, `]`,
  `/`, and GitHub names routinely contain `.`). A **single shared encode/decode helper** is used by
  **both** the CLI and the website so they can never drift. (e.g. `.` → `%2E`.)
- `number` is a clean child key.
- **No PR-level node** — `/prs/{owner}/{repo}/{number}` is purely a container of artifacts. The PR's
  GitHub title is **not** stored (navigation is one-directional, PR→gallery; we never go back).

### artifactId
- **RTDB `push()` key.** Collision-free across concurrent writers **with no transaction** (solves
  the "multiple agents uploading at once" problem), and **chronologically ordered** so reading the
  subtree back yields upload order for free.
- *Not* a sequential number (would need a racy read-increment transaction). Display numbers like
  "Image 3" are derived from position at render time, never stored.

### Storage path
```
prs/{owner}/{repo}/{number}/{artifactId}.{ext}
```
- Same sanitized segments as the RTDB tree, built by the same shared helper, so blob ↔ metadata are
  mechanically linked.

### Per-artifact metadata (the RTDB node value)
| Field | Type | Notes |
|---|---|---|
| `storagePath` | string | locate blob to render / delete |
| `contentType` | string | drives image-vs-video rendering; must be in the allowlist (§6) |
| `uploadedAt` | number | TTL reasoning + age display + ordering fallback |
| `title` | string (non-empty) | **required**; prominent label shown on the tile |

Deliberately **not stored:** `uploadedBy` (premise is "Claude uploads"), `sizeBytes`,
`viewport`/`scenario` (nice later; RTDB is schemaless so adding needs zero migration),
`originalFilename`.

---

## 5. CLI (stays "dumb")

Keyed on `owner/repo#number`. No `git`/`gh` dependency — the consuming **skill** auto-detects PR
info (e.g. `gh pr view --json`) and passes it in.

| Command | Behaviour |
|---|---|
| `upload <file> --repo owner/name --pr N --title "..."` | **Appends** an artifact. `--title` is **required** (errors on a bare upload). Runs a pre-flight size/type check (friendly fail). Uploads blob → writes RTDB metadata → **prints the per-PR gallery URL**. |
| `clear --pr owner/name#N` | Wipes **all** of a PR's artifacts — both Storage blobs and the RTDB node. |

- **Multiple artifacts per PR is a first-class requirement** (viewports × scenarios). Never one image.
- **Re-review flow** (orchestrated by the skill, not the CLI): `clear --pr` then upload the fresh
  batch. The CLI never needs to be clever about "is this a new run."
  - *Known accepted risk:* clear-then-upload has a gap where, if the new upload dies after the clear,
    that PR is left empty. For agent-driven use this is a non-issue — the agent just re-runs.

---

## 6. Lifecycle & cost controls

### TTL
- **6 months**, via a **native Cloud Storage object-lifecycle rule** (delete objects older than
  ~180 days). No Cloud Function.
- A lifecycle rule deletes the **blob** but cannot touch RTDB, so a TTL expiry **orphans the
  metadata**. **Accepted** — only happens on the rare TTL path (manual delete and `clear` remove
  both sides). Expired-blob tiles render a placeholder / broken image; no special handling.

### Size caps & type allowlist (enforced **hard in Storage rules** + friendly CLI pre-flight)
- **Image cap: 10 MB.**
- **Video cap: 50 MB.** (Rules can cap size but *cannot* check video duration — size is the only
  lever against a 5-minute recording.)
- **Strict content-type allowlist:** `image/png`, `image/jpeg`, `image/webp`, `video/mp4`,
  `video/webm`. Rejects everything else — doubles as a **security control** (bucket can't hold
  arbitrary/servable files).

### No thumbnails / transcoding
- Gallery loads full images with **native lazy-loading** (`loading="lazy"`); videos use
  `<video preload="metadata">` (poster frame only until played). Zero Cloud Functions.

---

## 7. Gallery website

### Home page
- Lists **all PRs that have evidence** (across repos): each row shows `owner/repo#123` +
  artifact count + a link to open its gallery + a **delete** control.
- **Multi-select → "Delete selected PRs"** for clearing several closed PRs at once. (No single
  "nuke everything" button — multi-select gives the same speed with intent.)
- Built by reading the `/prs` tree client-side (small text metadata; no extra storage).
- *Per-repo filter: deferred, not MVP.*

### Per-PR page
- **Grid + lightbox.** Grid overview; click a tile to open it full-screen; click backdrop / Esc to
  close; ← / → and swipe to step between artifacts.
- **Images:** rendered as tiles in the grid; full-size in the lightbox.
- **Videos:** shown as a **title** in the grid (no preview faff); clicking opens `<video controls>`
  in the lightbox (full native controls).
- **Ordering:** natural upload order (push-key order); no sorting logic.
- **"Delete all for this PR"** button — same action as the home-page row delete.
- **No per-artifact delete** — the smallest delete unit is a whole PR.

### Deletion behaviour
- **Manual delete (home page row, multi-select, or per-PR button)** removes **both** the Storage
  blob(s) and the RTDB node(s) — the browser client SDK does both in one operation, so this path
  never orphans metadata.
- **All deletes behind a confirm dialog.**

---

## 8. Security Rules

- **RTDB:** `auth != null` for **read, write, and delete** (everyone authenticated — bot + humans).
- **RTDB validation (tight):** rules enforce the node shape — required `title` (non-empty string),
  `contentType` (string, in the allowlist), `storagePath` (string), `uploadedAt` (number), and
  **reject unknown fields**. The rules are the contract: nothing malformed can land even if the CLI
  has a bug.
- **Storage:** `auth != null`, plus the hard **size caps** (`request.resource.size` ≤ 10 MB images /
  50 MB videos) and the **content-type allowlist** (`request.resource.contentType`).

---

## 9. PR comment posting (out of scope for this project)

- The **CLI only prints** the gallery URL. Whether to post it as a PR comment is left to each
  consuming **skill/project**.
- *Advisory guidance only* (not enforced here): a skill should **post a single comment and update it
  in place** (find-by-marker, edit) rather than a new comment per upload, to keep the PR clean across
  re-reviews.

---

## 10. Deferred (carry-forward, not MVP)

- **PR-merge auto-delete** — "delete a PR's evidence when its GitHub PR merges." Needs the browser to
  ask GitHub if `owner/repo#N` is merged: trivial for **public** repos (unauth GET), but **private**
  repos need a GitHub token (paste a PAT into the gallery, or a proxy) — coupling we're avoiding for
  now. The data model already carries `owner/repo#number`, so this bolts on later with **no
  migration**.
- **Reviewer-scoping** (reviewers see only PRs they're given) — a read-rule tightening, no data change.
- **Per-repo filter** on the home page.
- **`viewport`/`scenario`** structured metadata fields.

---

## 11. Environment

- Windows 11, PowerShell. Firebase project to be created fresh.

---

## 12. Implementation outline (status)

| Step | Status |
|---|---|
| Create Firebase project (Blaze), enable RTDB / Storage / Hosting / Auth | Todo |
| Set $5 budget alert in GCP | Todo |
| Create bot account + human accounts by hand | Todo |
| `database.rules.json` (auth + validated shape) | Todo |
| `storage.rules` (auth + size caps + type allowlist) | Todo |
| Storage lifecycle rule (6-month TTL) | Todo |
| Shared `encode/decode` segment helper | Todo |
| CLI: `upload` + `clear` (client SDK, gitignored creds) | Todo |
| Gallery: home page (PR list + delete + multi-select) | Todo |
| Gallery: per-PR page (grid + lightbox + delete-all) | Todo |
| Login page (email/password, no signup) | Todo |
| Deploy Hosting | Todo |
