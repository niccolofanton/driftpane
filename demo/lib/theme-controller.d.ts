import { DriftpaneStorage } from './storage.js';
/** Theme setting: 'auto' follows the system, the others force it. */
export type DriftpaneTheme = 'auto' | 'light' | 'dark';
/** Theme actually resolved and applied to the DOM. */
type ResolvedTheme = 'light' | 'dark';
export interface ThemeControllerOptions {
    /** Element that receives the data-theme attribute (typically pane.element). */
    target: HTMLElement;
    /** Namespaced storage to persist the choice (key 'theme'). */
    storage: DriftpaneStorage;
    /** Initial theme (default from createDriftpane; typically 'auto'). */
    initial: DriftpaneTheme;
}
export declare class ThemeController {
    private readonly target;
    private readonly storage;
    /** Current setting (auto/light/dark), NOT the resolved value. */
    private setting;
    /** MediaQueryList for `prefers-color-scheme: dark`, if available. */
    private readonly mql;
    /** Listener currently attached to `mql` (only in 'auto' mode). */
    private mqlListener;
    constructor(opts: ThemeControllerOptions);
    /** Current setting (auto/light/dark), NOT the resolved value. */
    get(): DriftpaneTheme;
    /** Theme actually applied ('light' | 'dark'), useful for the UI. */
    resolved(): ResolvedTheme;
    /** Sets the setting, persists and applies it (updates data-theme). */
    set(theme: DriftpaneTheme): void;
    /** Removes the matchMedia listener. */
    dispose(): void;
    /**
     * Applies the effective theme to the DOM and (re)manages the system listener:
     * in 'auto' it attaches it to follow preferences live, otherwise it detaches
     * it (an explicit setting must not react to system changes).
     */
    private apply;
    /**
     * Resolves the current setting into a concrete theme.
     * In 'auto' it queries matchMedia; without matchMedia the default is 'dark'
     * (the skin is dark by default).
     */
    private resolve;
    /**
     * Gets the system MediaQueryList defensively. Returns `null` if
     * window/matchMedia are not available or if the call throws.
     */
    private queryDark;
    /**
     * Attaches the `change` listener to the media query (idempotent).
     * Uses addEventListener with a fallback to addListener for old Safari.
     */
    private attachListener;
    /** Detaches the `change` listener from the media query, if present. */
    private detachListener;
}
export {};
