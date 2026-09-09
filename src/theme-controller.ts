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

import {DriftpaneStorage} from './storage.js';

/** Theme setting: 'auto' follows the system, the others force it. */
export type DriftpaneTheme = 'auto' | 'light' | 'dark';

/** Theme actually resolved and applied to the DOM. */
type ResolvedTheme = 'light' | 'dark';

/** Key (namespaced by the storage) under which the choice is persisted. */
const STORAGE_KEY = 'theme';

/** Media query used to resolve 'auto'. */
const DARK_QUERY = '(prefers-color-scheme: dark)';

/** Type-guard: is the value a valid DriftpaneTheme? */
function isDriftpaneTheme(value: unknown): value is DriftpaneTheme {
	return value === 'auto' || value === 'light' || value === 'dark';
}

export interface ThemeControllerOptions {
	/** Element that receives the data-theme attribute (typically pane.element). */
	target: HTMLElement;
	/** Namespaced storage to persist the choice (key 'theme'). */
	storage: DriftpaneStorage;
	/** Initial theme (default from createDriftpane; typically 'auto'). */
	initial: DriftpaneTheme;
}

export class ThemeController {
	private readonly target: HTMLElement;
	private readonly storage: DriftpaneStorage;

	/** Current setting (auto/light/dark), NOT the resolved value. */
	private setting: DriftpaneTheme;

	/** MediaQueryList for `prefers-color-scheme: dark`, if available. */
	private readonly mql: MediaQueryList | null;

	/** Listener currently attached to `mql` (only in 'auto' mode). */
	private mqlListener: ((ev: MediaQueryListEvent) => void) | null = null;

	constructor(opts: ThemeControllerOptions) {
		this.target = opts.target;
		this.storage = opts.storage;

		// Persisted read > initial: if a valid theme is in storage, it wins.
		const persisted = this.storage.readJSON<unknown>(STORAGE_KEY, null);
		this.setting = isDriftpaneTheme(persisted) ? persisted : opts.initial;

		// matchMedia may not exist (SSR/jsdom): we resolve it just once.
		this.mql = this.queryDark();

		// Apply immediately: writes data-theme and, if 'auto', attaches the listener.
		this.apply();
	}

	/** Current setting (auto/light/dark), NOT the resolved value. */
	public get(): DriftpaneTheme {
		return this.setting;
	}

	/** Theme actually applied ('light' | 'dark'), useful for the UI. */
	public resolved(): ResolvedTheme {
		return this.resolve();
	}

	/** Sets the setting, persists and applies it (updates data-theme). */
	public set(theme: DriftpaneTheme): void {
		this.setting = theme;
		this.storage.writeJSON(STORAGE_KEY, theme);
		this.apply();
	}

	/** Removes the matchMedia listener. */
	public dispose(): void {
		this.detachListener();
	}

	// --- Internals ----------------------------------------------------------

	/**
	 * Applies the effective theme to the DOM and (re)manages the system listener:
	 * in 'auto' it attaches it to follow preferences live, otherwise it detaches
	 * it (an explicit setting must not react to system changes).
	 */
	private apply(): void {
		if (this.setting === 'auto') {
			this.attachListener();
		} else {
			this.detachListener();
		}
		this.target.setAttribute('data-theme', this.resolve());
	}

	/**
	 * Resolves the current setting into a concrete theme.
	 * In 'auto' it queries matchMedia; without matchMedia the default is 'dark'
	 * (the skin is dark by default).
	 */
	private resolve(): ResolvedTheme {
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
	private queryDark(): MediaQueryList | null {
		try {
			if (
				typeof window === 'undefined' ||
				typeof window.matchMedia !== 'function'
			) {
				return null;
			}
			return window.matchMedia(DARK_QUERY);
		} catch {
			return null;
		}
	}

	/**
	 * Attaches the `change` listener to the media query (idempotent).
	 * Uses addEventListener with a fallback to addListener for old Safari.
	 */
	private attachListener(): void {
		if (!this.mql || this.mqlListener) {
			return;
		}
		const listener = (): void => {
			// The system changed preference: in 'auto' we re-apply.
			this.target.setAttribute('data-theme', this.resolve());
		};
		this.mqlListener = listener;
		if (typeof this.mql.addEventListener === 'function') {
			this.mql.addEventListener('change', listener);
		} else if (typeof this.mql.addListener === 'function') {
			// Deprecated API, fallback for older browsers (Safari < 14).
			this.mql.addListener(listener);
		}
	}

	/** Detaches the `change` listener from the media query, if present. */
	private detachListener(): void {
		if (!this.mql || !this.mqlListener) {
			return;
		}
		const listener = this.mqlListener;
		if (typeof this.mql.removeEventListener === 'function') {
			this.mql.removeEventListener('change', listener);
		} else if (typeof this.mql.removeListener === 'function') {
			this.mql.removeListener(listener);
		}
		this.mqlListener = null;
	}
}
