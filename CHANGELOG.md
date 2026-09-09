# Changelog

## 1.2.1 (2026-09-10)

### Fixes

* **`onStateApplied` never fired for presets applied from the menu.** 1.2.0 wired the
  hook to the programmatic `applyPreset()` only. Every apply that starts in the
  preset folder — picking from the selector, "Restore", "Import", deleting the
  active preset — goes through `PresetMenu`'s own `presets.apply()` +
  `onAfterApply()` path instead, so a consumer relying on the hook heard nothing.
  The hook now fires from `onAfterApply`, which every menu-originated apply
  funnels through.
* **`refreshList()` re-applied the active preset as a side effect.** Writing
  `listBlade.value` emits `change` exactly as a click does, and the handler
  treated it as a user pick. So any list refresh — after a rename, a save, a
  delete — silently re-applied the active preset, discarding unsaved edits, and
  (since 1.2.0) fired `onStateApplied` for what is only a UI sync. The
  programmatic write is now guarded. This bug predates 1.2.0; the hook is what
  made it visible.

### Tests

* Two regressions added to `test/real-tweakpane-restore.test.ts`, both driving the
  real preset selector rather than the facade — the path neither the previous
  tests nor the `FakePane` double covered.

## 1.2.0 (2026-09-10)

### Features

* **`onStateApplied(reason)` hook** — called once after Driftpane applies a state
  to the pane, with `reason` being `'restore'`, `'preset'`, `'share'` or
  `'share-discard'`. It exists for state your `change` handlers do not own: a
  flag read once at init, a value mirrored into your own storage key, anything
  not attached to a binding. A throwing callback is swallowed so a consumer bug
  cannot break startup.

### Documentation

* **Corrected a false caveat in the README.** It claimed that `importState()`
  does not re-fire binding `change` handlers, and told consumers to call their
  own `applyAll()` after `createDriftpane`. That is not what Tweakpane v4 does:
  `InputBindingController.importState` calls `binding.inject(value)` followed by
  `value.fetch()`, which drives the rawValue setter and re-emits `change` for
  every value that actually differs. Side effects performed in those handlers
  therefore already run on restore, at every nesting depth, with `ev.last` true.
  The advice made consumers add redundant re-apply code.

### Tests

* **New `test/real-tweakpane-restore.test.ts`.** The rest of the suite runs
  against the `FakePane` double, which models `importState()` as a positional
  value copy and so could never have caught the above. These 8 tests drive the
  real `tweakpane` package (4.0.5) through the real Driftpane and lock in the
  contract: restore and preset-apply re-fire the handlers, only changed values
  fire, `ev.last` is true, and `onStateApplied` fires once per apply.

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
