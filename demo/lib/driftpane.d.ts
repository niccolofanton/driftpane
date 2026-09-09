import { DraggableController } from './draggable.js';
import { PresetController } from './presets.js';
import { ThemeController } from './theme-controller.js';
import { DriftpaneOptions } from './types.js';
/**
 * Structural type of the Pane required by the facade. Uses only public members
 * of Tweakpane, so the layer does not depend on internal core imports.
 */
export interface PaneLike {
    exportState(): Record<string, unknown>;
    importState(state: Record<string, unknown>): boolean;
    on(ev: 'change' | 'fold', handler: (e: unknown) => void): unknown;
    addBlade(params: Record<string, unknown>): unknown;
    refresh(): void;
    element: HTMLElement;
}
export declare class Driftpane {
    /** The managed Pane. */
    readonly pane: PaneLike;
    /** Preset controller (programmatic API). */
    readonly presets: PresetController;
    /** Drag controller (can be used to reset the position). */
    readonly draggable: DraggableController;
    /** Theme controller (programmatic API: theme.set('dark'), etc.). */
    readonly theme: ThemeController;
    private readonly storage;
    private readonly persistence;
    private readonly presetMenu;
    private readonly presetsEnabled;
    private readonly draggableEnabled;
    /** URL sharing controller, or null when `urlSync` is disabled. */
    private readonly urlShare;
    /** Resolver for the preset folder index (last child), shared by all features. */
    private readonly managerChildIndex;
    /** Host of the height cap (the root panel, = pane.element). */
    private readonly maxHeightHost;
    constructor(pane: PaneLike, opts?: DriftpaneOptions);
    /**
     * Sets the maximum height of the panel at runtime, and persists it. Beyond
     * the cap the panel becomes scrollable.
     * @param value Number = height in `vh`; string = any CSS length
     *   (e.g. '400px', 'calc(100dvh - 48px)'); `null` = restore the default
     *   (`calc(100dvh - 48px)`, 24px safe zone top/bottom) and forget the override.
     */
    setMaxHeight(value: number | string | null): void;
    /**
     * Serializes a FULL backup of the namespace's persisted state into a versioned
     * JSON envelope: panel values/folds (`state`), drag `position`, `width`,
     * `maxHeight`, `theme` and the whole `presets` store. Missing keys are omitted.
     */
    exportAllJSON(): string;
    /** Saves the current state as a new preset with the given name. */
    savePresetAs(name: string): void;
    /** Applies a preset by id and updates the UI. */
    applyPreset(id: string): void;
    /**
     * Resets the persisted pane state (does NOT touch the presets nor the
     * position). Removes the state key; on reload, the pane returns to the
     * initial defaults.
     */
    resetState(): void;
    /** Resolves the preset folder index (number or lazy resolver). */
    private resolveManagerIndex;
    /**
     * Handles an incoming shared link: applies the shared config as a live preview
     * (pausing persistence so the preview is never written), then prompts to
     * import/overwrite or discard. Async because decoding is async.
     */
    private handleIncomingShare;
    /** Common tail of accepting a shared preset: persist + resume + restamp URL. */
    private finishShareAccept;
    /**
     * Builds the shareable URL for the current config WITHOUT changing the address
     * bar. Resolves to the current location when URL sync is disabled.
     */
    shareUrl(): Promise<string>;
    /**
     * Writes the current config into the URL, copies it to the clipboard (when
     * available), and returns it.
     */
    copyShareLink(): Promise<string>;
    /** Removes the share param from the URL (the "stop sharing" affordance). */
    clearShareUrl(): void;
    /** Tears down the manager: removes listeners and added UI. */
    dispose(): void;
}
/** Functional helper: instantiates a Driftpane on an existing Pane. */
export declare function createDriftpane(pane: PaneLike, opts?: DriftpaneOptions): Driftpane;
