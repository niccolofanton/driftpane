# Driftpane

**Driftpane** is a small, **non-invasive** layer on top of
[Tweakpane](https://tweakpane.github.io/) v4 that turns a debug panel into a
real, persistent control surface — without touching the Tweakpane core.

One call on an existing `Pane` adds four things:

1. **State persistence** — control values _and_ the `expanded` state of the pane
   are saved to `localStorage` and restored on reload.
2. **Draggable, resizable, persistent panel** — the pane is wrapped in a
   `position: fixed` container you can drag by its title bar (mouse + touch),
   clamped to the viewport. A right-edge handle resizes the width. Position and
   width persist.
3. **Persistent open/closed folders (nested too)** — the `expanded` state of the
   pane and of _every_ folder/tab, at any depth, survives a reload.
4. **Presets** — save / apply / list / rename / export / import named snapshots
   of the state, via a dedicated folder **auto-injected as the last entry** of
   the pane.

Driftpane uses **only Tweakpane's public API** (`exportState` / `importState`,
`element`, `addFolder` / `addButton` / `addBlade`, `on('change')` /
`on('fold')`). No core file is modified — so this fork stays cleanly mergeable
with upstream Tweakpane (see [below](#updating-tweakpane)).

> 📦 The package and its full documentation live in **[`driftpane/`](./driftpane)**.

## Install

```bash
npm install driftpane tweakpane
```

`tweakpane` is a **peer dependency** (Tweakpane v4, `tweakpane@^4.0.0`): install
it alongside Driftpane.

## Quick start

```ts
import {Pane} from 'tweakpane';
import {createDriftpane} from 'driftpane';

const params = {speed: 0.5, color: '#1e1e1e'};

const pane = new Pane({title: 'Parameters'});
pane.addBinding(params, 'speed', {min: 0, max: 1});
pane.addBinding(params, 'color');

// Build the pane first, then enable all four features in one call.
const panel = createDriftpane(pane, {
  storageNamespace: 'demo',
  draggable: true,
  presetsEnabled: true, // injects the "Preset" folder as the LAST entry
  clampToViewport: true,
});

// Programmatic API:
panel.savePresetAs('Dark');
panel.applyPreset('<id>');
panel.resetState(); // clears persisted state (not presets nor position)
```

> ℹ️ `importState()` does **not** re-fire your binding `change` handlers. If your
> app applies side effects in those handlers, call your own `applyAll()` (and
> `pane.refresh()`) right after `createDriftpane` so the restored values take
> effect on first paint.

## Optional theme

An "Apple-minimal / frosted glass" skin ships with the package — dark by default,
light via `data-theme="light"`:

```ts
import 'driftpane/theme.css';
```

For the exact look, load the Geist fonts:

```html
<link
  href="https://fonts.googleapis.com/css2?family=Geist:wght@300..700&family=Geist+Mono:wght@400;500&display=swap"
  rel="stylesheet"
/>
```

## Updating Tweakpane

This repository is a **fork of [`cocopon/tweakpane`](https://github.com/cocopon/tweakpane)**:
the entire Driftpane layer lives in [`driftpane/`](./driftpane) and never touches
the core, so pulling upstream stays conflict-free.

```bash
cd driftpane
./update-tweakpane.sh            # fetch upstream/main and realign the demo CDN pin
./update-tweakpane.sh v4.1.0     # or a specific release/branch
```

## Documentation

Full docs (architecture, the preset model, localStorage keys, the core
positional-import constraint, demo instructions) are in
**[`driftpane/README.md`](./driftpane/README.md)**.

## License

MIT. Tweakpane itself is © [cocopon](https://github.com/cocopon), also MIT.
</content>
