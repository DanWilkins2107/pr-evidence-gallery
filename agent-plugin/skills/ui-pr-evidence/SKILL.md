---
name: ui-pr-evidence
description: "Attach visual evidence to a pull request that changes UI. Use proactively, as part of your own workflow and without waiting to be asked: whenever you open a PR (e.g. right after `gh pr create`), push new commits to an open PR, or mark a PR ready for review, and the branch changes front-end code (pages, components, styles, templates). Captures every changed view at desktop 1280px and mobile 375px, plus a screen recording for multi-step flows, and uploads them to the PR gallery. A PR with UI changes is not finished until this has run. Skip for PRs with no UI changes."
shell: powershell
allowed-tools: Bash, PowerShell
---

## When this applies

Applies only to PRs that change UI code. **Skip it for back-end, CLI, CI, DB and docs
PRs** — check the diff against the PR's base branch first:

```powershell
$base = gh pr view --json baseRefName -q .baseRefName
git fetch origin $base
git diff --name-only "origin/$base...HEAD"
```

Decide what counts as UI from the repo itself, not from a fixed path:

- The repo's `CLAUDE.md` (or `AGENTS.md`) may name its front-end directories — use that
  if present.
- Otherwise, treat as UI anything that changes what a user sees in a browser: components
  and pages (`.tsx`, `.jsx`, `.vue`, `.svelte`, `.astro`), templates (`.html`, `.hbs`,
  `.erb`, `.cshtml`, …), styles (`.css`, `.scss`, `.less`), and static front-end assets —
  wherever they live in the repo.
- Test files, stories, type-only changes and config do not count on their own.

If no UI files changed, say so in one line and stop. Don't capture evidence for a
PR with no visible change.

## What to capture

- **Every changed view** at **desktop 1280px** and **mobile 375px**.
- **A screen recording** for any multi-step flow (a wizard, a checkout, anything
  where a single frame doesn't show the behaviour).

Capture ad-hoc with `npx playwright`; **commit nothing** — no test files, no
screenshots, no `playwright.config` left behind in the diff. Write captures to a temp
directory outside the repo.

If the repo's `CLAUDE.md` has its own evidence policy, that policy wins over the
defaults above.

## Procedure

1. **Check scope.** Diff against the base branch (above). UI files changed → continue.
2. **Run the app.** Start the front end the way the repo documents it (README,
   `package.json` scripts, `CLAUDE.md`). Seed or mock whatever data the changed views
   need to render meaningfully.
3. **List the changed views.** Map the changed files to the pages/components a
   reviewer would need to see. If a changed component is shared, capture the page(s)
   where the change is most visible rather than every page that uses it.
4. **Capture.** For each view, take the two viewport screenshots; for each multi-step
   flow, record a video. Save to a temp path. Name each capture so the title is
   obvious: `<Page> – desktop 1280px`, `<Page> – mobile 375px`, `<Scenario> walkthrough`.
5. **Upload.** Hand off to the `pr-evidence` skill (`/pr-evidence:pr-evidence`) with the
   captured files — it detects the PR, uploads each artifact, and posts/updates the
   single gallery comment on the PR.
6. **Clean up.** Stop any dev server you started. `git status --short` should show no
   new capture artifacts or Playwright scaffolding.

## If evidence can't be captured

If the app won't run, the `pr-evidence` CLI is not on PATH, or `gh` is not
authenticated, **don't silently drop the evidence and don't block waiting for help**.
Post a PR comment explaining what was skipped and why (if `gh` works), and include it
in your final report.
