# Contributing to Driftpane

Thanks for your interest in improving **Driftpane**! This guide covers how the repo is
laid out, how to set up a dev environment, and the conventions your changes need to follow.

## Repository layout

This repository is a **fork of [`cocopon/tweakpane`](https://github.com/cocopon/tweakpane)**.
The publishable enhancement layer lives entirely in [`driftpane/`](./driftpane) and is the
only thing distributed on npm as the `driftpane` package.

Everything outside `driftpane/` is upstream Tweakpane. Please **do not modify**:

- `packages/core/**`
- `packages/tweakpane/**`
- the upstream CI workflow `.github/workflows/ci.yml`

Keeping all changes inside `driftpane/` is what lets us pull upstream Tweakpane updates with
conflict-free merges. If you need a core change, send it upstream to `cocopon/tweakpane`
instead.

## Dev setup

All package scripts run from the `driftpane/` directory:

```bash
cd driftpane
npm install
```

## Checks

Before opening a PR, run the full set of checks locally:

```bash
cd driftpane
npm run lint            # eslint (incl. simple-import-sort)
npm run typecheck       # tsc -p tsconfig.json
npm run format:check    # prettier --check
npm run test:coverage   # vitest run with v8 coverage
npm run build           # clean + tsc -p tsconfig.build.json → dist/
```

PRs must pass the **`driftpane-ci`** workflow, which runs the same checks on
**Node 18, 20 and 22**. Note that only changes under `driftpane/**` trigger the Driftpane
CI and release workflows.

## Code style

- **Prettier** with the repo's [`prettier.config.js`](./prettier.config.js): **tabs** for
  indentation and **single quotes**. Run `npm run format:check` (or your editor's Prettier
  integration) to stay in sync.
- **ESLint** with `simple-import-sort` — keep imports sorted; `npm run lint` will flag
  ordering issues.
- TypeScript is **strict**; keep the public API typed and avoid `any`.

## Commit messages

Driftpane uses **[Conventional Commits](https://www.conventionalcommits.org/)**, because
release-please derives the changelog and the next version number directly from commit
history. Use one of these prefixes:

```
feat: add resizable handle on the left edge
fix: clamp panel position after viewport resize
docs: document DriftpaneOptions defaults
chore: bump dev dependencies
```

- `feat:` → minor version bump (new functionality)
- `fix:` → patch version bump (bug fix)
- `docs:` / `chore:` / `refactor:` / `test:` → no version bump

Add a `!` after the type (e.g. `feat!:`) or a `BREAKING CHANGE:` footer for breaking changes.

## How releases work

Releases are fully automated with
[release-please](https://github.com/googleapis/release-please):

1. Merging Conventional Commits to the default branch makes release-please open (or update)
   a **Release PR** that bumps the version and updates `driftpane/CHANGELOG.md`.
2. Merging that Release PR tags the release (`driftpane-v*`, e.g. `driftpane-v0.1.0`),
   creates the GitHub Release, and publishes the package to npm.

The only manual setup needed to enable real publishing is adding the **`NPM_TOKEN`** repo
secret; without it the publish job is a no-op.
