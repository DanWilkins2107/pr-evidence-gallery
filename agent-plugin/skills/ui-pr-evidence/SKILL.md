---
name: ui-pr-evidence
description: "Attach visual evidence to a pull request that changes UI. Use proactively, as part of your own workflow and without waiting to be asked: whenever you open a PR (e.g. right after `gh pr create`), push new commits to an open PR, or mark a PR ready for review, and the branch changes front-end code (pages, components, styles, templates). Captures every changed view at desktop 1280px and mobile 375px, plus a screen recording for multi-step flows, and uploads them to the PR gallery. A PR with UI changes is not finished until this has run. Skip for PRs with no UI changes."
shell: powershell
allowed-tools: Bash, PowerShell
---

## When this applies

Applies only to PRs that touch UI code (in AgentAssembly: `web/`). **Skip it for CLI,
CI, DB and docs PRs** — check the diff first:

```powershell
git diff --name-only origin/main...HEAD
```

If nothing under the UI path changed, say so and stop. Don't capture evidence for a
back-end-only PR.

## What to capture

- **Every changed view** at **desktop 1280px** and **mobile 375px**.
- **A screen recording** for any multi-step flow (a wizard, a checkout, anything
  where a single frame doesn't show the behaviour).

Capture ad-hoc with `npx playwright`; **commit nothing** — no test files, no
screenshots, no `playwright.config` left behind in the diff. Write captures to a temp
directory outside the repo.

If the consuming repo's `CLAUDE.md` has its own evidence policy, that policy wins over
the defaults above.

## Procedure

1. **Check scope.** Diff against the base branch (above). UI files changed → continue.
2. **List the changed views.** Map the changed files to the pages/components a
   reviewer would need to see. If the mapping is unclear, ask the user which views
   matter rather than guessing broadly.
3. **Capture.** For each view, take the two viewport screenshots; for each multi-step
   flow, record a video. Save to a temp path. Name each capture so the title is
   obvious: `<Page> – desktop 1280px`, `<Page> – mobile 375px`, `<Scenario> walkthrough`.
4. **Upload.** Hand off to the `pr-evidence` skill (`/pr-evidence:pr-evidence`) with the
   captured files — it detects the PR, uploads each artifact, and posts/updates the
   single gallery comment on the PR.
5. **Confirm the diff is clean.** `git status --short` should show no new capture
   artifacts or Playwright scaffolding.

## If the tooling is missing

If the `pr-evidence` CLI is not on PATH, or `gh` is not authenticated, **say so on the
PR** (as a comment) rather than silently dropping the evidence — and tell the user.
