import { PresetController } from './presets.js';
/** Tweakpane button (minimal) with element access for icons/layout. */
export interface ButtonLike {
    on(ev: 'click', handler: () => void): unknown;
    dispose(): void;
    /** Button blade element (.tp-lblv) — exposed by Tweakpane. */
    element?: HTMLElement;
    /** Disabled state (exposed by Tweakpane ButtonApi). */
    disabled?: boolean;
}
/** Minimal Tweakpane folder API used by the menu. */
export interface FolderLike {
    addButton(params: {
        title: string;
        label?: string;
    }): ButtonLike;
    addBlade(params: Record<string, unknown>): {
        on(ev: 'change', handler: (e: {
            value: unknown;
        }) => void): unknown;
        value: unknown;
        options: unknown;
        dispose(): void;
    };
    dispose(): void;
}
/** Minimal pane API used to create the preset folder at the bottom. */
export interface PaneLike {
    addBlade(params: Record<string, unknown>): unknown;
    element: HTMLElement;
}
/**
 * Minimal (duck-typed) API of the theme controller, so the menu does not depend
 * on the concrete ThemeController class. Matches its public contract.
 */
export interface ThemeControllerLike {
    get(): 'auto' | 'light' | 'dark';
    set(theme: 'auto' | 'light' | 'dark'): void;
}
export interface PresetMenuOptions {
    folderTitle: string;
    /** Callback invoked after applying a preset (for UI refresh). */
    onAfterApply: () => void;
    /** Optional callback for the "Reset position" button. */
    onResetPosition?: () => void;
    /**
     * Optional theme controller: when present, the menu adds a "Theme" selector
     * as the first entry of the preset folder. When absent, the behavior stays
     * identical (additive field).
     */
    themeController?: ThemeControllerLike;
    /** Whether to show the "Delete preset" button (with confirmation). Default: false. */
    showDeletePreset?: boolean;
    /**
     * Optional callback for the "Export all" button: returns the file name and the
     * JSON content of a full namespace backup. When absent, the button is hidden.
     */
    onExportAll?: () => {
        filename: string;
        content: string;
    };
}
export declare class PresetMenu {
    private readonly pane;
    private readonly presets;
    private readonly opts;
    private folder;
    private listBlade;
    private fileInput;
    private saveChangesBtn;
    private revertBtn;
    private deleteBtn;
    constructor(pane: PaneLike, presets: PresetController, opts: PresetMenuOptions);
    /**
     * Creates and mounts the preset folder AT THE BOTTOM of the pane (last child).
     * @returns the created FolderLike.
     */
    mount(): FolderLike;
    /**
     * Rebuilds the selector options when the preset list changes.
     * Also updates the selected value to the current activeId.
     */
    refreshList(): void;
    /**
     * Updates the `disabled` state of the buttons that depend on the active
     * preset: "Save changes" and "Restore" require an active preset; "Delete"
     * requires the active preset to be deletable (custom).
     */
    private updateButtonStates;
    /** Unmounts the menu and removes the hidden file input. */
    dispose(): void;
    /** Adds the icon classes to the button blade (if accessible). */
    private markButton;
    /**
     * Reusable "button row" system: moves the blades of N buttons into a single
     * flex row (.dp-btn-row) so they sit side by side and split the width
     * equally (e.g. Export | Import, but works for 2..N). The click handlers stay
     * valid because we move the same blade elements.
     * Returns the row element (or null in environments without blade DOM, e.g. tests).
     */
    private groupIntoRow;
    /**
     * "Restore": discards live changes and re-applies the active preset. If there
     * are changes it asks for confirmation; with no changes it is a silent no-op.
     */
    private onRevert;
    /** "Save changes": overwrites the active (custom) preset, after confirmation. */
    private onSaveChanges;
    /**
     * "Save as new": creates a new custom preset. Proposes the active preset name
     * with the " (copy)" suffix.
     */
    private onSaveNew;
    /** "Delete preset": deletes the active preset if custom, after confirmation. */
    private onDelete;
    /** "Rename preset": renames the currently selected preset. */
    private onRename;
    /** "Export": downloads the SELECTED preset as a .json file named after it. */
    private onExport;
    /** "Export all": downloads a full backup of the namespace's persisted state. */
    private onExportAll;
    /**
     * Turns a preset name into a safe file name: drops path separators and chars
     * that browsers/OSes reject, collapses whitespace, strips leading dots. Falls
     * back to "preset" when nothing usable remains.
     */
    private safeFilename;
    /** "Import JSON": opens the file picker (with a text-prompt fallback). */
    private onImport;
    private buildOptions;
    /**
     * Blocking confirmation (window.confirm) with a "true" fallback in
     * environments without window (e.g. tests/SSR): destructive actions are not
     * blocked but they are not silently skipped either.
     */
    private confirm;
    private createFileInput;
    private importFromPrompt;
    private applyImport;
    private downloadFile;
    private promptName;
    private notify;
}
