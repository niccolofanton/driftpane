// THEME controller for the Driftpane skin: manages the setting
// (auto/light/dark), persists it, and applies the effective theme by writing
// the `data-theme` attribute on the target element (typically pane.element).
//
// In 'auto' mode it follows the system `prefers-color-scheme` IN REAL TIME,
// attaching a listener to matchMedia; when the user forces light/dark the
// listener is removed, and reattached if returning to 'auto'.
//
// It is defensive toward environments without `window`/`matchMedia` (SSR, jsdom
// without polyfill): in that case 'auto' resolves to 'dark' (the skin default)
// and attaches no listener, never throwing.
/** Key (namespaced by the storage) under which the choice is persisted. */
const STORAGE_KEY = 'theme';
/** Media query used to resolve 'auto'. */
const DARK_QUERY = '(prefers-color-scheme: dark)';
/** Type-guard: is the value a valid DriftpaneTheme? */
function isDriftpaneTheme(value) {
    return value === 'auto' || value === 'light' || value === 'dark';
}
export class ThemeController {
    constructor(opts) {
        /** Listener currently attached to `mql` (only in 'auto' mode). */
        this.mqlListener = null;
        this.target = opts.target;
        this.storage = opts.storage;
        // Persisted read > initial: if a valid theme is in storage, it wins.
        const persisted = this.storage.readJSON(STORAGE_KEY, null);
        this.setting = isDriftpaneTheme(persisted) ? persisted : opts.initial;
        // matchMedia may not exist (SSR/jsdom): we resolve it just once.
        this.mql = this.queryDark();
        // Apply immediately: writes data-theme and, if 'auto', attaches the listener.
        this.apply();
    }
    /** Current setting (auto/light/dark), NOT the resolved value. */
    get() {
        return this.setting;
    }
    /** Theme actually applied ('light' | 'dark'), useful for the UI. */
    resolved() {
        return this.resolve();
    }
    /** Sets the setting, persists and applies it (updates data-theme). */
    set(theme) {
        this.setting = theme;
        this.storage.writeJSON(STORAGE_KEY, theme);
        this.apply();
    }
    /** Removes the matchMedia listener. */
    dispose() {
        this.detachListener();
    }
    // --- Internals ----------------------------------------------------------
    /**
     * Applies the effective theme to the DOM and (re)manages the system listener:
     * in 'auto' it attaches it to follow preferences live, otherwise it detaches
     * it (an explicit setting must not react to system changes).
     */
    apply() {
        if (this.setting === 'auto') {
            this.attachListener();
        }
        else {
            this.detachListener();
        }
        this.target.setAttribute('data-theme', this.resolve());
    }
    /**
     * Resolves the current setting into a concrete theme.
     * In 'auto' it queries matchMedia; without matchMedia the default is 'dark'
     * (the skin is dark by default).
     */
    resolve() {
        if (this.setting !== 'auto') {
            return this.setting;
        }
        if (this.mql) {
            return this.mql.matches ? 'dark' : 'light';
        }
        // Environment without matchMedia: dark default of the skin.
        return 'dark';
    }
    /**
     * Gets the system MediaQueryList defensively. Returns `null` if
     * window/matchMedia are not available or if the call throws.
     */
    queryDark() {
        try {
            if (typeof window === 'undefined' ||
                typeof window.matchMedia !== 'function') {
                return null;
            }
            return window.matchMedia(DARK_QUERY);
        }
        catch {
            return null;
        }
    }
    /**
     * Attaches the `change` listener to the media query (idempotent).
     * Uses addEventListener with a fallback to addListener for old Safari.
     */
    attachListener() {
        if (!this.mql || this.mqlListener) {
            return;
        }
        const listener = () => {
            // The system changed preference: in 'auto' we re-apply.
            this.target.setAttribute('data-theme', this.resolve());
        };
        this.mqlListener = listener;
        if (typeof this.mql.addEventListener === 'function') {
            this.mql.addEventListener('change', listener);
        }
        else if (typeof this.mql.addListener === 'function') {
            // Deprecated API, fallback for older browsers (Safari < 14).
            this.mql.addListener(listener);
        }
    }
    /** Detaches the `change` listener from the media query, if present. */
    detachListener() {
        if (!this.mql || !this.mqlListener) {
            return;
        }
        const listener = this.mqlListener;
        if (typeof this.mql.removeEventListener === 'function') {
            this.mql.removeEventListener('change', listener);
        }
        else if (typeof this.mql.removeListener === 'function') {
            this.mql.removeListener(listener);
        }
        this.mqlListener = null;
    }
}
//# sourceMappingURL=theme-controller.js.map