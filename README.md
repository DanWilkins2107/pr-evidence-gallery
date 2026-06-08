# PR Evidence Gallery

A standalone Firebase project for attaching screenshots and videos to GitHub pull requests. The owner — and Claude, via a CLI wrapper — upload evidence; reviewers view it on a private, authenticated website. Nothing is ever publicly accessible. Authentication is Email/Password only; accounts are created by hand in the Firebase console (no self-signup).

## Repository layout

```
pr-evidence-gallery/
├── public/                 # Firebase Hosting root — the gallery website
│   ├── shared/
│   │   └── pathCodec.js    # Shared encode/decode helper (see note below)
│   ├── firebase-config.js  # Firebase web config (fill in placeholders before deploy)
│   ├── index.html          # Home page — lists all PRs with evidence (built by website agent)
│   ├── pr.html             # Per-PR gallery page — grid + lightbox (built by website agent)
│   └── login.html          # Login page — email/password (built by website agent)
├── cli/                    # Upload CLI tool — `upload` and `clear` commands (built by CLI agent)
│   ├── package.json
│   ├── .env.example
│   └── ...
├── docs/
│   └── SETUP.md            # Step-by-step Firebase project setup checklist
├── database.rules.json     # Firebase RTDB security rules
├── storage.rules           # Cloud Storage security rules
├── firebase.json           # Firebase project service config
├── .firebaserc             # Firebase project alias (fill in project ID)
└── package.json            # Root package (scripts for deploy / emulators)
```

### The shared codec

`public/shared/pathCodec.js` is imported **directly by both the CLI and the website**. It is the single source of truth for:

- Percent-encoding RTDB key segments (Firebase RTDB keys cannot contain `.`, `$`, `#`, `[`, `]`, `/`)
- Building RTDB paths and Cloud Storage object paths
- The allowed content-type registry (types, extensions, size caps)

Because both sides use the exact same file, RTDB paths written by the CLI and read by the browser can never drift.

## Quick start

See **[docs/SETUP.md](docs/SETUP.md)** for the complete, ordered setup checklist — from creating the Firebase project through deploying rules and hosting.
