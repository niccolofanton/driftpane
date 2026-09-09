import type { DriftpaneTheme } from './theme-controller.js';
/**
 * Serialized state of a Pane or a blade, as returned by `pane.exportState()`
 * and accepted by `pane.importState()`.
 *
 * Tweakpane does not expose a strong public type for this state (internally it
 * is `BladeState`), so we model it as a generic object. The real shape is a tree
 * `{ disabled, hidden, expanded?, title?, binding?, children? }`.
 */
export type SerializedState = Record<string, unknown>;
/**
 * A single preset: a named snapshot of `pane.exportState()`, already "scoped",
 * i.e. without the preset manager folder (always the first child of the pane).
 */
export interface DriftpanePreset {
    /** Unique identifier (crypto.randomUUID with fallback). */
    id: string;
    /** Human-readable name shown in the selector. */
    name: string;
    /** Creation epoch ms. */
    createdAt: number;
    /** Epoch ms of the last overwrite/rename. */
    updatedAt: number;
    /** Scoped snapshot of exportState() (without the preset folder). */
    state: SerializedState;
    /**
     * true = CUSTOM preset created by the user (renamable/deletable, shown with a
     * small icon in the selector). false/absent = DEFAULT preset provided by the
     * app (not deletable). Legacy presets without the field are treated as custom.
     */
    custom?: boolean;
}
/**
 * Collection of presets persisted in localStorage.
 */
export interface DriftpanePresetStore {
    /** Schema versioning for future migrations. */
    version: 1;
    /** Id of the currently selected preset (or null). */
    activeId: string | null;
    /** List of saved presets. */
    presets: DriftpanePreset[];
}
/**
 * Position of the draggable container in viewport coordinates (px).
 * Persisted in a localStorage key SEPARATE from the pane state.
 */
export interface DriftpanePosition {
    x: number;
    y: number;
}
/**
 * Versioned envelope carried in the share URL. It encodes a preset's identity
 * plus its scoped (values-only) state. For a CUSTOM preset `id` is set and
 * `d` is false; for a built-in/default preset `id` is omitted and `d` is true
 * (its identity is the name marker, so it is never overwritten on import).
 */
export interface DriftpaneShareEnvelope {
    /** Format tag. */
    f: 'driftpane-share';
    /** Envelope version. */
    v: number;
    /** Preset UUID (custom presets only). */
    id?: string;
    /** Human-readable preset name. */
    n: string;
    /** True when this is a built-in/default preset (name-marker identity). */
    d: boolean;
    /** Scoped, expanded-stripped pane state (values only). */
    s: SerializedState;
}
/**
 * Identity of the active preset, used to stamp the share URL.
 */
export interface DriftpaneShareIdentity {
    /** UUID, present for custom presets. */
    id?: string;
    /** Preset name. */
    name: string;
    /** True for built-in/default presets (carried as a name marker). */
    isDefault: boolean;
}
/**
 * Manager configuration options. All fields are optional: the defaults are
 * applied by the `Driftpane` facade.
 */
export interface DriftpaneOptions {
    /**
     * Namespace for the localStorage keys, so that multiple independent panels can
     * coexist on the same origin. Default: 'default'.
     */
    storageNamespace?: string;
    /** Debounce window (ms) for saving the state. Default: 300. */
    debounceMs?: number;
    /** Enables dragging the panel from the title-bar. Default: true. */
    draggable?: boolean;
    /** Enables the preset menu (folder always at the bottom). Default: true. */
    presetsEnabled?: boolean;
    /** Title of the preset folder. Default: 'Preset'. */
    presetFolderTitle?: string;
    /**
     * Name of the "Default" preset auto-created when no default preset exists yet:
     * it captures the INITIAL (factory) state of the pane and is the target of
     * "Restore". It is NOT deletable nor overwritable (baseline). Default:
     * 'Default'.
     */
    defaultPresetName?: string;
    /**
     * Shows the "Theme" selector inside the preset folder. The theme is applied
     * anyway based on the `theme` option / `driftpane.theme.set()`: this only
     * controls the VISIBILITY of the selector. Default: false (hidden).
     */
    showThemeControl?: boolean;
    /**
     * Shows the "Reset position" button inside the preset folder.
     * Default: false (hidden). The position remains resettable via
     * `driftpane.draggable.resetPosition()`.
     */
    showResetPosition?: boolean;
    /**
     * Shows the "Delete preset" button inside the preset folder (with
     * confirmation). It deletes only the user's CUSTOM presets, never the default
     * ones; the button is disabled when the active preset is not deletable.
     * Default: false (hidden, "decided programmatically").
     */
    showDeletePreset?: boolean;
    /**
     * Shows the "Export all" button inside the preset folder: it downloads a full
     * backup of the namespace's persisted state (panel values/folds, position,
     * width, max-height, theme AND every preset) as a single JSON file. The plain
     * "Export" button instead exports only the selected preset, named after it.
     * Default: false (hidden).
     */
    showExportAll?: boolean;
    /** Keeps the panel within the viewport edges. Default: true. */
    clampToViewport?: boolean;
    /**
     * Initial position of the panel on first launch (when no saved position
     * exists yet). Default: { x: 24, y: 24 } (safe zone).
     */
    defaultPosition?: DriftpanePosition;
    /**
     * Skin theme (requires `import 'driftpane/theme.css'`): 'auto' follows the
     * system `prefers-color-scheme` in real time, 'light'/'dark' force it. The
     * `data-theme` attribute is set on `pane.element`, so the scope is the panel
     * only. Changeable at runtime from the "Theme" selector in the preset folder,
     * or via `driftpane.theme.set(...)`. Default: 'auto'.
     */
    theme?: DriftpaneTheme;
    /**
     * Maximum height of the panel in `vh` units. When the content exceeds it, the
     * entire panel becomes scrollable; the open/close animation is not altered. If
     * omitted, the default is `calc(100dvh - 48px)` (a 24px safe zone top/bottom),
     * always active so the panel never exceeds the viewport. Changeable at runtime
     * with `driftpane.setMaxHeight(...)`.
     */
    maxHeightVh?: number;
    /**
     * Initial width of the panel in px (a "sensible" default measure). If the user
     * has already resized it, the persisted width wins. Default: 280.
     */
    width?: number;
    /**
     * Whether the user can resize the WIDTH by dragging the handle on the right
     * edge. When false, the handle is not created (fixed width).
     * Default: true.
     */
    resizableWidth?: boolean;
    /**
     * Whether the user can resize the HEIGHT by dragging the handle on the bottom
     * edge: dragging UPDATES the max-height (persisted). When false, the handle is
     * not created (height governed only by maxHeightVh/default).
     * Default: true.
     */
    resizableHeight?: boolean;
    /**
     * Enables URL config sharing: the active config travels in a namespaced query
     * param (`<urlParamKey>:<storageNamespace>`), live-synced via `replaceState`
     * and reconciled (import/overwrite) when a shared link is opened. The shared
     * unit is a preset with identity, so the share UI lives in the preset folder —
     * enabling this **forces the preset menu on** even if `presetsEnabled` is
     * false. Default: true.
     */
    urlSync?: boolean;
    /**
     * Prefix for the namespaced share query param. The full key is
     * `<urlParamKey>:<storageNamespace>` (e.g. `dp:default`). Default: 'dp'.
     */
    urlParamKey?: string;
}
export type { DriftpaneTheme } from './theme-controller.js';
