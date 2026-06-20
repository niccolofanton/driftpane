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
    /** Tears down the manager: removes listeners and added UI. */
    dispose(): void;
}
/** Functional helper: instantiates a Driftpane on an existing Pane. */
export declare function createDriftpane(pane: PaneLike, opts?: DriftpaneOptions): Driftpane;
