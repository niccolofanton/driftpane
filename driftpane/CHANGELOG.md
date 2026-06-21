# Changelog

## 1.1.0 (2026-06-21)

### Features

* **Optional "Export all" button** (`showExportAll`, hidden by default) — downloads
  a full namespace backup as a single JSON file: panel state/folds, position,
  width, max-height, theme and every preset. New `driftpane.exportAllJSON()` API.
* **"Export" now exports the SELECTED preset**, as a single JSON file named after
  it (e.g. `My Preset.json`), instead of the whole collection under a fixed name.
  The full collection stays available via the `exportJSON()` / `exportPresetJSON(id)`
  programmatic APIs.

### Changes

* **Open/closed state is now global, not per-preset** — presets store values only;
  the `expanded` state of folders/tabs is stripped from snapshots and re-applied
  from the live state on apply. Applying a preset no longer changes which panels
  are open, and toggling a fold no longer marks the preset as modified.

## 1.0.0 (2026-06-20)

First public release of Driftpane — a non-invasive layer on Tweakpane v4 that,
through a single `createDriftpane(pane, options)` call, adds the following
without touching the core (it uses only the public `Pane` API):

### Features

* **State persistence** — control values and the `expanded`/collapsed state of
  the pane and of every folder/tab (at any nesting depth) are saved to
  `localStorage` and restored on reload.
* **Draggable, resizable panel** — the pane is wrapped in a `position: fixed`
  container draggable from the title bar (mouse + touch), clamped to the
  viewport. Handles on the right edge (width), the bottom edge (height), and the
  bottom-right corner (both at once, like a regular window) resize it; each axis
  can be disabled (`resizableWidth` / `resizableHeight`). Position, width, and
  height are persisted.
* **Presets menu** — save / restore / rename / delete / export / import named
  snapshots of the state, in a dedicated folder auto-injected at the bottom of
  the pane. A non-deletable, non-overwritable **"Default"** baseline (the pane's
  factory state) is always present and is the target of *Restore*. The menu lays
  buttons out in side-by-side rows with icons; *Delete preset* and *Reset
  position* are opt-in (`showDeletePreset` / `showResetPosition`).
* **Light / dark / auto skin theme** (requires `import 'driftpane/theme.css'`) —
  `auto` (default) follows the system `prefers-color-scheme` in real time;
  `light`/`dark` force it. Settable at init (`theme`), at runtime
  (`driftpane.theme.set(...)`), or from an optional control in the preset folder
  (`showThemeControl`). `data-theme` is scoped to `pane.element`.
* **Max height + scroll** — beyond a `max-height` the content becomes scrollable.
  Default `calc(100dvh - 48px)` (24px safe zone), always on so the panel never
  exceeds the viewport. Configurable via `maxHeightVh` or at runtime with
  `driftpane.setMaxHeight(n | css | null)`. The cap acts on the content, so the
  open/close animation is unchanged.
* **Optional "Apple-minimal" theme** shipped with the package
  (`driftpane/theme.css`): frosted glass, a cool-gray palette, flat folders with
  icons and +/- markers, and a "dynamic island" collapse animation. Namespaced
  `--dp-*` helper variables.

### API

* `createDriftpane(pane, options)` — one call enables all features on an existing
  `Pane`. Options include `storageNamespace`, `theme`, `maxHeightVh`, `width`,
  `resizableWidth`, `resizableHeight`, `showThemeControl`, `showResetPosition`,
  `showDeletePreset`, and `defaultPresetName`.
* Public controllers exposed on the returned instance: `presets`, `draggable`,
  `theme`, plus `savePresetAs`, `applyPreset`, `setMaxHeight`, and `resetState`.

### Engineering

* Ships as an npm package with `tweakpane` as a `peerDependency` (`^4.0.0`); the
  layer lives entirely under `driftpane/` and never touches the core, so the fork
  stays cleanly mergeable from upstream Tweakpane.
* jsdom test suite (143 tests), strict TypeScript, ESLint + Prettier, and a
  self-contained demo.
