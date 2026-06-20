import { DriftpaneStorage } from './storage.js';
import { DriftpanePreset, SerializedState } from './types.js';
/** Minimal pane API used by presets. */
export interface PaneLike {
    exportState(): SerializedState;
    importState(state: SerializedState): boolean;
}
export interface PresetOptions {
    /**
     * Index of the preset folder to exclude from snapshots. The preset folder is
     * the LAST child: typically a `() => last index` resolver (see
     * driftpane.ts); also accepts a fixed number (used by tests).
     */
    managerChildIndex: number | (() => number);
}
export declare class PresetController {
    private readonly pane;
    private readonly storage;
    private readonly managerChildIndex;
    private store;
    constructor(pane: PaneLike, storage: DriftpaneStorage, opts: PresetOptions);
    /** Resolves the preset folder index (fixed number or lazy resolver). */
    private resolveManagerIndex;
    /** List of presets (defensive copy of the array). */
    list(): DriftpanePreset[];
    /** Id of the active preset (or null). */
    activeId(): string | null;
    /** Returns a preset by id, or undefined. */
    get(id: string): DriftpanePreset | undefined;
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
     * Ensures a DEFAULT preset exists (custom: false): if no default preset is
     * already present, creates one by capturing the current snapshot (the pane's
     * initial state) as a NON-deletable, non-overwritable baseline, to be used as
     * the target of "Restore". If there is no active preset, it makes it active.
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
