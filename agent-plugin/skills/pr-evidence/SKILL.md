---
name: pr-evidence
description: "Upload already-captured screenshots or screen recordings to the current branch's PR gallery and post (or update) the single gallery-link comment on the PR. Use whenever you have visual evidence files for a PR, typically as the final step of ui-pr-evidence, or when a PR's evidence must be re-uploaded after new changes. To decide what to capture for a UI change, run ui-pr-evidence instead."
argument-hint: "[pr-number]"
shell: powershell
allowed-tools: Bash, PowerShell
---

## Prerequisites

- **`pr-evidence` CLI** must be on PATH (installed globally via `npm link` from the gallery repo).
- **`gh` CLI** must be authenticated (`gh auth status` should show the active account).

If either is missing, stop and include that in your final report — don't block waiting for help.

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

If there is no open PR for the current branch, **stop** — the gallery is keyed on a PR, so uploading without one is not possible. Run this again once the PR is open.

Assign the results to:
- `$repo` — e.g. `acme/my-app`
- `$prNumber` — e.g. `42`

### 2. Make sure you have captures

Normally the captured files come from `ui-pr-evidence`, which holds the capture policy. If you arrived here without captures, run `ui-pr-evidence` first — or, if the repo's `CLAUDE.md` has its own "evidence" / "screenshots" policy, capture what that describes.

Captures should be local temp files outside the repo. Common titles to aim for: `"<Page> – desktop 1280px"`, `"<Page> – mobile 375px"`, `"<Scenario> walkthrough"`.

**This skill is only about getting captured files into the gallery.**

### 3. Handle re-review (fresh batch)

If you are uploading a **fresh batch** to replace a previous set (e.g. you pushed new UI commits to a PR that already has evidence), first clear the previous batch:

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

### 6. Report

Include in your final report:
- The gallery URL for the PR.
- How many artifacts were uploaded and their titles.
- That the PR comment has been posted/updated with the link.
