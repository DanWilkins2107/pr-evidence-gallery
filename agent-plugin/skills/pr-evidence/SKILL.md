---
name: pr-evidence
description: "Use when the user wants to attach visual evidence (screenshots or screen recordings) to the current GitHub PR and share a private gallery link, e.g. after implementing a UI change or before requesting review."
argument-hint: "[pr-number]"
shell: powershell
allowed-tools: Bash, PowerShell
---

## Prerequisites

- **`pr-evidence` CLI** must be on PATH (installed globally via `npm link` from the gallery repo).
- **`gh` CLI** must be authenticated (`gh auth status` should show the active account).

If either is missing, stop and tell the user before proceeding.

---

## Procedure

### 1. Detect the PR

Run the following to get the repo and PR number:

```powershell
# Repo in owner/name format
gh repo view --json nameWithOwner -q .nameWithOwner

# PR number for the current branch
gh pr view --json number -q .number
```

If a `[pr-number]` argument was provided, use it as the PR number instead of auto-detecting.

If there is no open PR for the current branch, **stop and tell the user** to open a PR first. The gallery is keyed on a PR — uploading without one is not possible.

Assign the results to:
- `$repo` — e.g. `acme/my-app`
- `$prNumber` — e.g. `42`

### 2. Determine what to capture

Check the consuming repo's `CLAUDE.md` for an "evidence", "screenshots", or "visual evidence" section that describes what to capture (which views, viewports, scenarios).

- If an evidence policy is found, follow it.
- If none is found, use your judgment about what is obviously relevant to the change (e.g. the page or UI component that was modified). You may ask the user what they want captured if the change scope is unclear.

Capture the required screenshots or screen recordings and save them as local temp files. The exact capture toolchain is not prescribed here — use whatever screenshot or recording capability is available. Common titles to aim for: `"<Page> – desktop 1280px"`, `"<Page> – mobile 375px"`, `"<Scenario> walkthrough"`.

**This skill is only about getting captured files into the gallery.** The evidence policy lives in the consuming repo's `CLAUDE.md`, not here.

### 3. Handle re-review (fresh batch)

If you are uploading a **fresh batch** to replace a previous set (e.g. the user said "re-upload" or evidence already exists for this PR), first clear the previous batch:

```powershell
pr-evidence clear --pr "$repo#$prNumber"
```

Note: clear-then-upload has a brief gap — if the upload dies after the clear, the PR is left empty. If that happens, simply re-run from step 3.

Skip this step if this is the first upload for the PR (or if you are intentionally appending).

### 4. Upload each artifact

For each captured file, run:

```powershell
pr-evidence upload "<localFilePath>" --repo $repo --pr $prNumber --title "<Concise descriptive title>"
```

- **`--title` is required** and must be non-empty. Use a description that conveys the viewport and scenario, e.g.:
  - `"Home – desktop 1280px"`
  - `"Checkout flow – mobile 375px"`
  - `"Checkout flow walkthrough"` (for video)
- The last `upload` invocation prints the per-PR gallery URL. Capture it for use in step 5.

### 5. Post or update the PR comment

Call the helper script to post a single PR comment with the gallery URL (or update the existing one in place — it uses a hidden HTML marker so it is idempotent across re-reviews):

```powershell
& "$env:CLAUDE_PLUGIN_ROOT\skills\pr-evidence\post-gallery-comment.ps1" `
    -Repo $repo `
    -Pr $prNumber `
    -Url $galleryUrl
```

If `$env:CLAUDE_PLUGIN_ROOT` is not set, use the path relative to this skill file's location.

The script prints either `"Posted gallery comment"` or `"Updated gallery comment"`.

### 6. Report to the user

Tell the user:
- The gallery URL for the PR.
- How many artifacts were uploaded and their titles.
- That the PR comment has been posted/updated with the link.
