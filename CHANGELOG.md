# Changelog

## 1.4.2 (2026-09-26)

- Fixed CI formatting with the Prettier version pinned in the lockfile.

## 1.4.1 (2026-09-26)

- Fixed preset creation and renaming in the menu, including selection and
  duplicate-name handling.
- Kept shared URL previews, preset selection, saves and imports consistent when
  URL parameters change or asynchronous operations overlap.
- Hardened preset restoration, backup validation, disposal and UI lifecycle;
  added regression tests for the reported flows.

## 1.4.0 (2026-09-20)

- Added sidepanel presentation: left/right, hover/push, runtime open/close and
  width controls, mobile overlay fallback, keyboard focus and layout cleanup.
- Minimal demo with a three-mode selector, live preview and compact feature disclosures.
- Docked controls fill the viewport height; hover mode has a keyboard/touch-accessible edge tab.
- Push layout animates with the panel; docked styling matches the page with rounded edges and subtle depth.
- CI installs with pnpm to match the migrated lockfile.
- Top-layer pickers hide when their containing sidepanel closes.

## 1.3.0 (2026-09-20)

### Complete playground

- Rebuilt the existing waveform demo into an interactive showcase of all seven
  features, full backups, apply callbacks and independent namespaces.
- Added a separate receiver sandbox for Import / Overwrite / Discard, runtime
  controls, responsive layouts and reduced-motion support.
- Readonly monitor updates no longer mark an otherwise unchanged preset dirty.

### Fixes

- Preset selections that cannot be applied now return to the actual active
  preset; deleting an active preset applies its successor before emitting the
  state-applied hook. Direct controller changes also refresh the menu.
- Factory Default values and structure refresh once per initialized session,
  retaining the baseline identity. Public overwrite/remove APIs protect it;
  raw state imports handle the pane's manager folder.
- The manager folder is located by identity after controls are added or removed.
  Structure checks distinguish same-key bindings with different labels or
  readonly status, and merge-by-path skips ambiguous matches.
- Nested tab selection is restored into Tweakpane's selection model. Presets
  and shared states preserve local folder/tab navigation; legacy preset
  snapshots are normalized too. Folders added later gain persistence listeners.
- Storage reads and removals remain available when writes fail because of quota
  limits; a failed write probe no longer disables access to existing data.
- Readonly monitor updates no longer keep postponing editable state saves.
  URL sync also reacts to preset identity changes without binding changes;
  clearing a link cancels queued/in-flight writes, and disposal prevents late
  incoming decode results from applying state. Corrupt compressed payloads are
  handled without leaving an unhandled stream rejection.
- Drag/resize tracks the active pointer, avoids changes on clicks without
  movement, preserves height on collapsed/corner-width-only gestures, and
  adapts rendered size to the viewport while retaining preferred dimensions.
  Disabling and re-enabling dragging preserves the pane's DOM placement without
  accumulating wrappers or stale gesture handlers.
- Scroll height accounts for the title bar and viewport. Color/point pickers can
  escape scroll clipping through the browser top layer, with an inline fallback.
  Programmatic theme changes keep the optional theme selector synchronized.
  The light-theme root shadow uses the light override, and the demo consumes the
  shared package skin instead of maintaining a divergent copy.

### Backup restore

- `importAllJSON(raw)` and the menu's **Import** action restore full namespace
  backups. Included fields replace their counterparts in the receiving panel;
  missing fields remain unchanged. Custom collections are replaced while the
  receiver's current factory Default is preserved.
- Exports include current values, navigation and layout rather than waiting for
  pending state debounces. Failed imports retain the prior pane state and do
  not discard a pending user-edit save.

### Adversarial review fixes

- Failed or throwing state imports roll back controls already changed by
  Tweakpane, covering persistence restores, presets and shared configurations.
- Backup collections reject malformed snapshots before replacing saved presets.
  Unsupported declared versions are rejected; opening a newer persisted store
  leaves it untouched and releases initialization listeners. Legacy stores
  without a version remain supported.
- Imported Default files become user-owned presets. Older backups with multiple
  protected Defaults retain the additional presets as editable copies instead
  of dropping them. Empty or reserved selector IDs are regenerated.
- Pending file reads are aborted when the menu is disposed or another file is
  selected, and stale callbacks cannot import state after teardown.
- Backup import cannot overwrite an unresolved shared preview. Shared state
  preserves local root visibility; concurrent link-copy requests return the
  latest usable link, and clearing a link invalidates pending incoming reads.
- Resetting persistence through a pane button no longer recreates the cleared
  key through the same click. Immediately folded newly added folders retain
  their state.
- Invalid saved positions are normalized; lost pointer capture ends gestures.
  Drag and resize use the pane's own window for iframe events and bounds.
- Popup positioning follows scrolling ancestors. Explicit pane themes retain
  precedence over ancestor themes, including popup styling. Invalid height
  values are rejected before they can disable the viewport cap.

### Compatibility and verification

- **URL sharing is on by default** and can change the host query string while
  forcing the preset menu on. Set `urlSync: false` to opt out; set both
  `urlSync: false` and `presetsEnabled: false` to omit the preset folder.
- Added regressions using real Tweakpane for presets, navigation, full backups,
  URL lifecycle and identity changes, alongside drag/resize and popup checks.
- Updated the README, public type comments, URL-sharing specification and demo
  instructions to match the implementation.

## 1.2.2 (2026-09-10)

Packaging and documentation only — no runtime change.

### Fixes

* **The npm page rendered with broken links.** `package.json` still carried
  `repository.directory: "driftpane"` from before the package moved to the
  repository root, so npm resolved every relative README link against a
  directory that no longer exists — the preview GIF 404'd. `homepage` pointed at
  the same dead path and 404'd too. The field is removed, `homepage` corrected,
  and the README's remaining relative links made absolute so they survive on npm.
* **Wrong import specifier in the docs.** `theme.css` and the `theme` option's
  JSDoc both said `driftpane/theme.css` instead of
  `@niccolofanton/driftpane/theme.css`. The JSDoc one ships in `dist` and shows
  up in editor tooltips.
* The 1.2.0 entry below gained the repository flatten, which had shipped
  undocumented.

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

### Repository

* **The vendored Tweakpane fork was dropped and the package promoted to the
  repository root.** Driftpane never patched the Tweakpane core, so the 466
  vendored files under `packages/` were dead weight; `tweakpane` is consumed
  purely as a peer dependency now. The published package is unaffected — same
  name, same entry points, same contents — but paths inside the repo lost their
  `driftpane/` prefix.

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
