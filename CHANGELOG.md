# Changelog

All notable changes to **Driftpane** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> The package-local, release-please-managed changelog lives at
> [`driftpane/CHANGELOG.md`](./driftpane/CHANGELOG.md).

## [0.1.0] - 2026-06-20

### Added

- **Initial release.** A non-invasive TypeScript layer on top of Tweakpane v4 that adds:
  - **State persistence** — every control value plus the expanded/collapsed state of the
    pane and every nested folder/tab are saved to `localStorage` (debounced) and restored
    on reload.
  - **Draggable & resizable panel** — the pane is wrapped in a `position: fixed` container
    you can drag (mouse + touch via Pointer Events) and resize, clamped to the viewport;
    position and width are persisted.
  - **Persistent nested fold state** — the open/closed state of nested folders and tabs is
    remembered across refreshes.
  - **Presets menu** — a Presets folder pinned to the top of the pane to save, apply
    (dropdown), rename, export to JSON, and import from JSON (import applies immediately
    with an on-screen toast).
- **Public API** — `createDriftpane`, `Driftpane`, `PresetController`,
  `DraggableController`, `PersistenceController`, and the `DriftpaneOptions`,
  `DriftpanePreset`, `DriftpanePresetStore`, `DriftpanePosition`, and `SerializedState`
  types.

[0.1.0]: https://github.com/niccolofanton/driftpane/releases/tag/driftpane-v0.1.0
