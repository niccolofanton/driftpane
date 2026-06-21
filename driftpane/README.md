# Driftpane

### 📖 **[Read the documentation →](#usage)**

**[Usage](#usage) · [Options & API](#options-driftpaneoptions) · [Demo](#demo) · [Preset model](#preset-model)** &nbsp;|&nbsp; **[📦 npm](https://www.npmjs.com/package/@niccolofanton/driftpane)**

A **non-invasive** layer on top of [Tweakpane](https://tweakpane.github.io/) v4
that adds six features without modifying the core:

1. **State persistence** — control values and the pane's `expanded` state, saved
   to `localStorage` and restored on reload.
2. **Draggable, resizable, persistent panel** — the pane is wrapped in a
   `position:fixed` container you can drag by its title bar (mouse + touch),
   clamped to the viewport edges. Handles on the right edge (width), bottom edge
   (height) and bottom-right corner (both at once, like a regular app) resize it;
   when collapsed, the title bar keeps its width. Position, width and height are
   persisted. Each resize axis can be disabled
   (`resizableWidth`/`resizableHeight`).
3. **Persistent open/closed state of pane and folders (nested too)** — the
   `expanded` state of the pane and of EVERY folder/tab, at any depth, is
   persisted. Values come from `exportState()`; sub-panel folds are captured by
   recursive listeners plus a DOM-level safety net.
4. **Preset API** — save changes / save as new / restore / rename / delete /
   export / import named snapshots of the state, in a dedicated folder
   **always pinned to the bottom** of the pane (last entry, auto-injected). A
   **"Default"** preset (the factory baseline) is always present, cannot be
   deleted or overwritten, and is the target of "Restore".
5. **Skin theme** (requires `import '@niccolofanton/driftpane/theme.css'`) — `light` / `dark` /
   `auto`: `auto` (default) follows the system's `prefers-color-scheme` in real
   time. Settable at init (`theme`), at runtime (`driftpane.theme.set(...)`) or
   from an optional control in the preset folder.
6. **Max height + scroll** — beyond a `max-height` (default
   `calc(100dvh - 48px)`, a 24px safe zone) the content becomes scrollable
   without altering the open/close animation. Configurable via `maxHeightVh` or
   at runtime with `driftpane.setMaxHeight(...)`.

The layer uses **only the `Pane`'s public API**
(`exportState`/`importState`, `element`, `addFolder`/`addButton`/`addBlade`,
`on('change')`/`on('fold')`). No Tweakpane core file is ever touched.

## Installation

```bash
npm install @niccolofanton/driftpane tweakpane
```

`tweakpane` is a **peer dependency** (Tweakpane v4, `tweakpane@^4.0.0`): install
it alongside Driftpane. The public import is `from '@niccolofanton/driftpane'` (not a path
relative to `src/`).

## Structure

```
driftpane/
  src/
    types.ts          Public types (preset, position, options)
    storage.ts        Namespaced, defensive wrapper over localStorage
    debounce.ts       Typed debounce with flush()/cancel()
    state-scope.ts    Strip/merge of the preset folder (core positional constraint)
    persistence.ts    Feature 1+3: save/restore exportState (debounced)
    draggable.ts      Feature 2: fixed container + drag/resize (W/H/corner) via Pointer Events
    presets.ts        Feature 4 (logic): preset CRUD, apply, export/import JSON, Default
    preset-menu.ts    Feature 4 (UI): bottom preset folder + button rows with icons
    theme-controller.ts Feature 5: light/dark/auto theme (follows prefers-color-scheme)
    scroll.ts         Feature 6: max-height cap + content scroll
    styles.ts         Injected CSS (draggable container, handles, scroll, icons)
    driftpane.ts     Facade/orchestrator (Driftpane class)
    index.ts          Barrel of public symbols
  demo/
    index.html        Self-contained demo (import-map to CDN 4.0.5)
    main.ts           Demo TS source (usage reference)
    tweakpane.d.ts    Minimal ambient declaration of 'tweakpane' for the demo's type-check
    tsconfig.lib.json Builds the src/*.ts layer -> demo/lib/*.js
    tsconfig.demo.json Builds main.ts -> main.js
    build.sh          Runs both builds (tsc)
    lib/              Generated JS output of the layer, imported by the demo
    main.js           Generated JS output of the demo entry
  tsconfig.json       Isolated type-check of the layer (strict)
  update-tweakpane.sh Updates Tweakpane from upstream + realigns the demo CDN pin
  README.md
```

## Usage

```ts
import {Pane} from 'tweakpane';
import {createDriftpane} from '@niccolofanton/driftpane';

const params = {speed: 0.5, color: '#1e1e1e'};

const pane = new Pane({title: 'Parameters'});
pane.addBinding(params, 'speed', {min: 0, max: 1});
pane.addBinding(params, 'color');

// Enable all features (every option is optional).
const panel = createDriftpane(pane, {
  storageNamespace: 'demo',
  debounceMs: 300,
  draggable: true,
  presetsEnabled: true,
  presetFolderTitle: 'Preset',
  clampToViewport: true,
  theme: 'auto', // 'auto' | 'light' | 'dark'  (requires import '@niccolofanton/driftpane/theme.css')
  width: 280, // initial width in px
  resizableWidth: true,
  resizableHeight: true,
  // maxHeightVh: 80,           // height cap in vh (default: calc(100dvh - 48px))
  // showThemeControl: true,    // show the "Theme" control in the preset folder
  // showResetPosition: true,   // show "Reset position"
  // showDeletePreset: true,    // show "Delete preset" (custom presets only)
  // showExportAll: true,       // show "Export all" (full namespace backup)
});

// Programmatic API:
panel.savePresetAs('Dark');
panel.applyPreset('<id>');
panel.theme.set('dark'); // sets the theme; .get() / .resolved() read it back
panel.setMaxHeight(80); // number = vh; string = CSS length; null = default
panel.resetState(); // clears persisted state (not presets nor position)
```

> **Note on the production import**: the published package is consumed as
> `@niccolofanton/driftpane` (e.g. `import {createDriftpane} from '@niccolofanton/driftpane'`), with
> `tweakpane` as a **peer dependency** (Tweakpane v4) shared by the app. The
> demo, by contrast, uses an import-map to a CDN purely so it can be opened in
> the browser without building the monorepo.

## Options (`DriftpaneOptions`)

All optional; defaults are applied by the `Driftpane` facade.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `storageNamespace` | `string` | `'default'` | Prefix for localStorage keys (multiple panels on the same origin). |
| `debounceMs` | `number` | `300` | Debounce window for saving state. |
| `draggable` | `boolean` | `true` | Drag the panel by its title bar. |
| `presetsEnabled` | `boolean` | `true` | Auto-injected preset folder (always at the bottom). |
| `presetFolderTitle` | `string` | `'Preset'` | Title of the preset folder. |
| `defaultPresetName` | `string` | `'Default'` | Name of the (factory) baseline preset that cannot be deleted. |
| `clampToViewport` | `boolean` | `true` | Keeps the panel within the viewport edges. |
| `defaultPosition` | `{x,y}` | `{x:24,y:24}` | Position on first launch (safe zone). |
| `theme` | `'auto'\|'light'\|'dark'` | `'auto'` | Skin theme; `auto` follows `prefers-color-scheme`. |
| `showThemeControl` | `boolean` | `false` | Show the "Theme" control in the preset folder. |
| `showResetPosition` | `boolean` | `false` | Show the "Reset position" button. |
| `showDeletePreset` | `boolean` | `false` | Show "Delete preset" (custom presets only). |
| `showExportAll` | `boolean` | `false` | Show "Export all": downloads a full namespace backup (state + position + size + theme + every preset). |
| `width` | `number` | `280` | Initial width in px (clamped to [200, 600]). |
| `resizableWidth` | `boolean` | `true` | Width resize handle (right edge). |
| `resizableHeight` | `boolean` | `true` | Height resize handle (bottom edge); the corner requires both. |
| `maxHeightVh` | `number` | `calc(100dvh - 48px)` | Height cap in `vh`; beyond it, the content scrolls. |

Corresponding programmatic API: `panel.theme` (`get`/`resolved`/`set`),
`panel.setMaxHeight(n|css|null)`, `panel.draggable.resetPosition()`,
`panel.savePresetAs(name)`, `panel.applyPreset(id)`, `panel.resetState()`.

## Demo

The demo (`demo/index.html` + `demo/main.ts`) is self-contained and **does not
require building the monorepo**: Tweakpane 4.0.5 is imported via import-map from
jsDelivr (the ESM build `dist/tweakpane.js`), while the Driftpane layer is used
from its local JS build (`demo/lib/`). The demo builds a Pane with three folders
(`Movement`, `Appearance` with a `Stroke` sub-folder, `Advanced`), bindings of
various kinds (slider, color, list, checkbox, text, button) and an animated
`<canvas>` preview that reflects the parameters, so the persisted state is
visibly "there" after a refresh.

### 1. Build (transpile TS -> JS)

`.ts` files don't run in the browser, so they must be compiled once with `tsc`:

```bash
cd driftpane/demo
./build.sh
# equivalent to:
#   tsc -p tsconfig.lib.json   # driftpane/src/*.ts -> demo/lib/*.js (+ .d.ts)
#   tsc -p tsconfig.demo.json  # demo/main.ts        -> demo/main.js
```

> The pre-compiled `.js` files are included: if you don't want to run `tsc`, you
> can skip straight to step 2.

### 2. Serve and open

Import-maps and ES modules do **not** work from `file://`: you need an HTTP
server.

```bash
cd driftpane/demo
python3 -m http.server 8080      # or:  npx http-server -p 8080
# then open http://localhost:8080/index.html
```

### What to try (the features)

1. Move the sliders and open/close the folders, then **reload**: values and
   open/closed state come back identical (feature 1 + 3).
2. Drag the panel by its **title bar** (mouse or touch); resize it from the
   right edge (width), the bottom edge (height) or the **bottom-right corner**
   (both at once): position and size survive the refresh (feature 2).
3. Click the title bar **without dragging** to collapse the panel: this state
   persists too (feature 1).
4. In the **Preset** folder (at the bottom): *Save as new* (prompts for a name)
   creates a custom preset; *Save changes* overwrites the active one (with
   confirmation); *Restore* reverts to the active preset, with **"Default"**
   always available as a baseline that can't be deleted; *Rename preset*,
   *Export*, *Import*. *Import* applies the config immediately and selects it
   (with a confirmation toast). The *Theme* control, *Reset position* and
   *Delete preset* are optional (`showThemeControl` / `showResetPosition` /
   `showDeletePreset`) (feature 4 + 5).

## Updating Tweakpane (pull from upstream)

This repo is a **local fork** of `cocopon/tweakpane`: the `upstream` remote
points at the original, so when an update ships you pull it from there. Because
the Driftpane layer lives entirely in `driftpane/` and **never touches the
core**, merges stay clean (no library file conflicts).

Quick way (recommended):

```bash
cd driftpane
./update-tweakpane.sh            # pull upstream/main and realign the CDN pin
./update-tweakpane.sh v4.1.0     # or a specific release/branch
```

The script checks the `upstream` remote, runs `git fetch upstream --tags`,
integrates the core updates with `git merge`, and **automatically realigns** the
Tweakpane version used by the demo (the `tweakpane@x.y.z` pin in the import-map
of `demo/index.html`) to the new package version.

Manual equivalent:

```bash
git fetch upstream --tags
git merge upstream/main          # or a release tag (e.g. v4.1.0)
# if the version changes, update the pin in driftpane/demo/index.html
(cd driftpane/demo && ./build.sh)
```

> The `upstream` remote is already configured. If you prefer, you can commit the
> `driftpane/` layer on a branch: upstream merges stay clean anyway because they
> share no files with the core.

## localStorage keys

All namespaced as `driftpane:<namespace>:<suffix>` (default namespace
`default`):

| Key                                 | Contents |
|-------------------------------------|-----------|
| `driftpane:<ns>:state`             | **Scoped** snapshot of `exportState()` (without the preset folder). Source of truth for values + the `expanded` state of pane and folders. Written debounced on `change`/`fold`. |
| `driftpane:<ns>:position`          | `{ x, y }` of the draggable container's position (viewport px). Independent of the pane's state. Written at drag end and re-clamped on resize. |
| `driftpane:<ns>:width`             | Pane width in px (number). Constrained to [200, 600]. Written at resize end. |
| `driftpane:<ns>:maxHeight`         | CSS length of the height cap (e.g. `"80vh"`, `"calc(100dvh - 48px)"`). Written at vertical resize end / by `setMaxHeight`. |
| `driftpane:<ns>:theme`             | Chosen theme: `"auto"` \| `"light"` \| `"dark"`. Written by the "Theme" control / `theme.set`. |
| `driftpane:<ns>:presets`           | `DriftpanePresetStore` `{ version:1, activeId, presets[] }`. |

## Preset model

A preset is a **named**, **scoped** snapshot of `pane.exportState()` — values
only, **without** the open/closed (`expanded`) state of folders/tabs (that memory
is global, not per-preset):

```ts
interface DriftpanePreset {
  id: string;          // crypto.randomUUID() with fallback
  name: string;        // human-readable name in the selector
  createdAt: number;   // epoch ms
  updatedAt: number;   // epoch ms
  custom?: boolean;    // false = "Default" baseline (not deletable/overwritable); legacy/missing = custom
  state: Record<string, unknown>; // exportState() WITHOUT the preset folder or any `expanded` flag
}

interface DriftpanePresetStore {
  version: 1;
  activeId: string | null;
  presets: DriftpanePreset[];
}
```

The **Export** button downloads the **selected preset** as a single JSON file
named after it (e.g. `My Preset.json`). The optional **Export all** button
(`showExportAll`) downloads a full namespace backup. The whole preset collection
is also available programmatically via `exportJSON()`, in a versioned envelope:

```json
{
  "format": "driftpane-presets",
  "version": 1,
  "exportedAt": "2026-06-19T00:00:00.000Z",
  "active": "<active id or null>",
  "presets": [ /* DriftpanePreset[] */ ]
}
```

**Import JSON** recognizes: the collection envelope (merge, colliding ids
regenerated), a single "bare" preset `{ name, state }`, or a raw
`exportState()` state. After importing, it **applies and selects** the first
imported preset immediately (so the effect is visible on the panel) and shows a
confirmation toast. Malformed input does not break the UI (the error is handled,
with an on-screen warning).

## Critical core constraint (why scoping is needed)

`ContainerBladeController.importState`
(`packages/core/src/blade/common/controller/container-blade.ts`) matches its
children **positionally** (`rack.children[index].importState(state.children[index])`)
and requires that **every** child import successfully. Because the preset folder
is the **last** child of the pane (we append it at the bottom), it must be
**excluded** from the persisted/preset snapshot
(`state-scope.stripManagerChild`, at the last index) and **re-inserted** from
its live state before `importState` (`state-scope.mergeManagerChild`), otherwise
the structure wouldn't match and the import would fail. The "last child" index
is computed at runtime via a lazy resolver passed in by the controllers (see
`driftpane.ts`).

## Design decisions

- **Drag position independent of presets**: applying a preset only calls
  `importState()` and does not move the panel. The position lives in its own
  separate key. The preset folder offers an optional "Reset position" button.
- **Open/closed state is global, not per-preset**: presets store values only,
  with the `expanded` state of folders/tabs stripped out. That memory lives in
  the global `state` key, so applying a preset never changes which panels are
  open. At apply time the current `expanded` flags are overlaid back onto the
  preset (`importState` requires the field).
- **Export = the selected preset** (the file is named after it); the optional
  **Export all** button downloads a full namespace backup (`exportAllJSON()`).
  The whole preset collection stays available via the `exportJSON()` /
  `exportPresetJSON(id)` programmatic APIs.
- **Debounce only, no `ev.last` filter**: the trailing-edge debounce already
  collapses an entire gesture into a single write by reading `exportState()` at
  flush time.
