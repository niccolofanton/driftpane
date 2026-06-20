import { DriftpaneStorage } from './storage.js';
import { SerializedState } from './types.js';
/**
 * Minimal superset of the Pane API used by persistence.
 * We depend only on public Tweakpane symbols.
 */
export interface PaneLike {
    exportState(): SerializedState;
    importState(state: SerializedState): boolean;
    on(ev: 'change' | 'fold', handler: (e: unknown) => void): unknown;
    element: HTMLElement;
}
/** Internal options of the persistence controller. */
export interface PersistenceOptions {
    debounceMs: number;
    /**
     * Index of the preset folder to exclude from the snapshot. The preset folder is
     * the LAST child, so it is typically a resolver `() => last index`
     * (see driftpane.ts); it also accepts a fixed number (used by the tests).
     */
    managerChildIndex: number | (() => number);
}
export declare class PersistenceController {
    private readonly pane;
    private readonly storage;
    private readonly managerChildIndex;
    private readonly debouncedSave;
    private disposed;
    private readonly onPageHide;
    private readonly onVisibilityChange;
    private readonly onChange;
    private readonly onFold;
    private readonly onPaneClick;
    constructor(pane: PaneLike, storage: DriftpaneStorage, opts: PersistenceOptions);
    /**
     * Registers a save listener on EVERY descendant sub-panel:
     * `fold` for folders (at any depth) and `select` for tabs. Uses only public
     * members (`children`, `pages`, `expanded`, `on`) via duck-typing, to avoid
     * depending on internal core imports.
     */
    private attachSubpanelListeners;
    /**
     * Restores the saved state by applying it to the pane.
     * @returns true if a valid state was found and applied.
     */
    restore(): boolean;
    /** Resolves the preset folder index (fixed number or lazy resolver). */
    private resolveManagerIndex;
    /** Schedules a debounced save. */
    scheduleSave(): void;
    /** Immediately saves the current scoped state to localStorage. */
    saveNow(): void;
    /** Removes the persisted state from storage. */
    clear(): void;
    /** Tears down the handlers and cancels pending saves. */
    dispose(): void;
}
