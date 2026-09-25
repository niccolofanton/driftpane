import { DriftpaneStorage } from './storage.js';
import { DriftpanePreset, DriftpaneShareEnvelope, DriftpaneShareIdentity, SerializedState } from './types.js';
/** Minimal pane API used by presets. */
export interface PaneLike {
    exportState(): SerializedState;
    importState(state: SerializedState): boolean;
}
export interface PresetOptions {
    /**
     * Index of the preset folder to exclude from snapshots. A resolver can track
     * the mounted folder when controls are added or removed; a fixed index is
     * also supported.
     */
    managerChildIndex: number | (() => number);
}
export declare class PresetController {
    private readonly pane;
    private readonly storage;
    private readonly managerChildIndex;
    private store;
    private readonly listeners;
    private factoryCaptured;
    private sharePreviewActive;
    /** Prevent ordinary preset mutations until an incoming share is resolved. */
    setSharePreviewActive(active: boolean): void;
    private assertEditable;
    constructor(pane: PaneLike, storage: DriftpaneStorage, opts: PresetOptions);
    /** Resolves the preset folder index (fixed number or lazy resolver). */
    private resolveManagerIndex;
    /** Observe collection or active identity changes. Returns an unsubscribe function. */
    subscribe(listener: () => void): () => void;
    /** Replace a backup collection while retaining this app's current factory baseline. */
    replaceStore(value: unknown): void;
    /** List of presets, detached from the mutable store. */
    list(): DriftpanePreset[];
    /** Id of the active preset (or null). */
    activeId(): string | null;
    /** Returns a preset by id, or undefined. */
    get(id: string): DriftpanePreset | undefined;
    private findPreset;
    private copyPreset;
    /** Creates a new CUSTOM preset from the current scoped snapshot. */
    save(name: string): DriftpanePreset;
    /**
     * Default name proposed for "save as new preset": the active preset name
     * with the " (copy)" suffix, or 'Preset' if there is no active preset.
     */
    suggestedNewName(): string;
    /** Name of the active preset (or null). */
    activeName(): string | null;
    /** Overwrites the ACTIVE preset with the current snapshot (no-op if absent). */
    overwriteActive(): boolean;
    /**
     * true if the live pane state differs from the active preset snapshot (i.e.
     * there are unsaved changes). false if there is no active preset or they match.
     */
    isModified(): boolean;
    /**
     * Restores the active preset, discarding live changes (re-applies its
     * snapshot). @returns true if applied.
     */
    revert(): boolean;
    /** true if the active preset exists and is CUSTOM (hence deletable). */
    isActiveDeletable(): boolean;
    /**
     * Deletes the ACTIVE preset if it is custom. @returns true if deleted.
     */
    removeActive(): boolean;
    /**
     * Captures the current app's DEFAULT preset once per controller session.
     * An existing baseline keeps its identity but receives the current factory
     * values and structure. Otherwise a non-deletable, non-overwritable baseline
     * is created and becomes active if nothing else is selected.
     * Must be called AFTER mounting the preset folder and BEFORE restoring
     * persistence (so it captures the factory defaults).
     * @returns true if the default was created.
     */
    ensureDefault(name?: string): boolean;
    /** Overwrites an existing preset's state with the current snapshot. */
    overwrite(id: string): DriftpanePreset;
    /**
     * Applies a preset to the pane via importState.
     * @returns true if the application succeeded.
     */
    apply(id: string): boolean;
    /** Removes a preset. */
    remove(id: string): void;
    /** Renames a preset. */
    rename(id: string, name: string): void;
    /** Scoped, expanded-stripped snapshot of the current live state. */
    currentSnapshot(): SerializedState;
    /**
     * Identity of the active preset for stamping the share URL: custom presets
     * carry their UUID; built-in/default presets carry a name marker (so they are
     * never overwritten on the other side). Null when there is no active preset.
     */
    activeIdentity(): DriftpaneShareIdentity | null;
    /**
     * Resolves what opening a shared link would do, WITHOUT applying it: overwrite
     * an existing custom preset (same UUID), or import as new.
     */
    resolveSharedAction(env: DriftpaneShareEnvelope): {
        action: 'overwrite' | 'import';
        existingName?: string;
    };
    /**
     * Accepts a shared link by OVERWRITING the existing preset with the same id,
     * capturing the current (previewed) live state. No-op if the id is unknown.
     */
    acceptSharedOverwrite(id: string): void;
    /**
     * Accepts a shared link by IMPORTING it as a preset, capturing the current
     * (previewed) live state as the snapshot:
     *  - custom uuid not in the store -> create preserving the id;
     *  - name-marker / no id -> idempotent by content (activate an identical preset
     *    if present), else create a new `"<name> (imported[ N])"`.
     */
    acceptSharedImport(env: DriftpaneShareEnvelope): DriftpanePreset;
    /** Unique `"<base> (imported)"` name, numbering on collision. */
    private uniqueImportedName;
    /** Serializes the ENTIRE collection into a versioned JSON envelope. */
    exportJSON(): string;
    /** Serializes a single preset (programmatic API, not wired into the UI). */
    exportPresetJSON(id: string): string;
    /**
     * Imports from a JSON string. Recognizes:
     *  - collection envelope ({ presets: [...] }) -> merge (colliding ids regenerated);
     *  - single bare preset ({ name, state }) -> added as new;
     *  - raw exportState ({ children: [...] } without name) -> new preset.
     * Defensive validation: malformed input throws a catchable Error.
     * @returns number of imported presets.
     */
    importJSON(raw: string): {
        imported: number;
        ids: string[];
    };
    /** Accept both scoped snapshots and full exports containing our manager folder. */
    private normalizeRawState;
    /** Scoped snapshot (without the preset folder) of the pane's current state. */
    private snapshot;
    private loadStore;
    private persist;
    private isPresetShape;
    /** Coerces an unknown object into a valid DriftpanePreset, or null. */
    private coercePreset;
    /**
     * Adds an imported preset, handling id collisions.
     * @returns the final id (possibly regenerated).
     */
    private addImportedPreset;
}
