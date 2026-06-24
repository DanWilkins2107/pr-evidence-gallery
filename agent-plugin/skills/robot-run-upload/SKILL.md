---
name: robot-run-upload
description: "Use when the user wants to upload video footage (or images) from a robot run/trial into the private gallery and get a link to review it, e.g. after completing a travel run and wanting to watch the footage back."
argument-hint: "[robot/batch] [run-number]"
shell: powershell
allowed-tools: Bash, PowerShell
---

## What this does

Uploads footage from a robot run into the same private gallery used by `pr-evidence`,
reusing the `pr-evidence` CLI by **repurposing its fields** (there is no GitHub PR involved):

| CLI flag      | Holds                | Example                          |
| ------------- | -------------------- | -------------------------------- |
| `--repo`      | `<robot>/<batch>`    | `rover-1/warehouse-2026-06-24`   |
| `--pr`        | run number (digits)  | `3`                              |
| `--title`     | footage label        | `"Aisle 4 traverse – onboard cam"` |

The gallery groups footage as `robot / batch # run-number`, and each run gets its own
review page at `<GALLERY_BASE_URL>/pr/<robot>/<batch>/<run-number>`.

## Prerequisites

- **`pr-evidence` CLI** must be on PATH (installed globally via `npm link` from the gallery repo).
  If it is missing, stop and tell the user.
- A configured root `.env` (the same one the CLI/web app use). If uploads fail with a config
  error, point the user at `docs/SETUP.md`.

`gh` is **not** required — this skill never touches GitHub.

---

## Procedure

### 1. Establish the run identity

Resolve three values:

- **robot** — a short robot identifier, e.g. `rover-1`
- **batch** — a grouping for the run, e.g. a site + date like `warehouse-2026-06-24`
- **run-number** — digits only, e.g. `3`

Sources, in order of preference:

1. A `[robot/batch]` and `[run-number]` argument passed to the skill.
2. Ask the user. If they give only a robot name, suggest a batch derived from today's date
   (e.g. `<site>-<YYYY-MM-DD>`) and ask which run number this is.

Constraints:

- `robot` and `batch` must **not** contain `/` (one slash total, separating the two).
  Dots, dashes, and other characters are fine — the CLI encodes them safely.
- `run-number` must be digits only. If the user describes the run by name rather than number,
  pick the next integer and tell them which number you used.

Assign:

- `$repo`      — e.g. `rover-1/warehouse-2026-06-24`
- `$runNumber` — e.g. `3`

### 2. Collect the footage files

Determine which local files to upload. Accept either:

- a directory (upload every supported file in it), or
- an explicit list of file paths.

Supported types: `.mp4`, `.webm` (video), `.png`, `.jpg`, `.jpeg`, `.webp` (image).

**Size caps (current):** video ≤ 50 MB, image ≤ 10 MB. If a clip exceeds the cap, the CLI
rejects it with a clear error. Tell the user they can either trim/compress the clip or, for
recurring large footage, raise the cap in `public/shared/pathCodec.js` (`CONTENT_TYPES`,
`maxBytes`) and redeploy the storage rules.

If a directory was given, enumerate the supported files in a stable order (sorted by name)
so the gallery shows them in a predictable sequence.

### 3. Handle a re-upload (fresh batch for the same run)

If the user wants to replace footage already uploaded for this run (e.g. "re-upload run 3"),
clear the previous set first:

```powershell
pr-evidence clear --pr "$repo#$runNumber"
```

Note: clear-then-upload has a brief gap — if the upload dies after the clear, the run page is
left empty. If that happens, just re-run from this step.

Skip this when adding footage to a new run, or when intentionally appending more clips.

### 4. Upload each file

For each file, run:

```powershell
pr-evidence upload "<localFilePath>" --repo $repo --pr $runNumber --title "<Concise label>"
```

- **`--title` is required** and must be non-empty. Make it describe the clip — camera,
  segment, or scenario — e.g.:
  - `"Full run – onboard cam"`
  - `"Aisle 4 traverse – overhead cam"`
  - `"Obstacle avoidance event @ 02:14"`
- The last `upload` invocation prints the run's gallery URL. Capture it for step 5.

### 5. Report to the user

Tell the user:

- The gallery URL for the run (`<GALLERY_BASE_URL>/pr/<robot>/<batch>/<run-number>`).
- How many files were uploaded and their titles.
- Which run identity was used (`robot / batch # run-number`), especially if you chose the
  run number or batch on their behalf.

The user reviews the footage by opening that URL and signing in (email/password). Videos play
in the lightbox with pinch-zoom/pan on mobile.
