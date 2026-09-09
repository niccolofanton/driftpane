import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DriftpaneStorage} from '../src/storage.js';
import {DriftpaneTheme, ThemeController} from '../src/theme-controller.js';

/**
 * Minimal mock of a MediaQueryList: jsdom does NOT implement matchMedia, so we
 * inject it ourselves. `setMatches` simulates the system preference change and
 * notifies the attached `change` listeners (as the browser would do live).
 */
class FakeMediaQueryList {
	public matches: boolean;
	public readonly media = '(prefers-color-scheme: dark)';
	private readonly listeners = new Set<(ev: MediaQueryListEvent) => void>();

	constructor(matches: boolean) {
		this.matches = matches;
	}

	public addEventListener(
		_type: 'change',
		cb: (ev: MediaQueryListEvent) => void,
	): void {
		this.listeners.add(cb);
	}

	public removeEventListener(
		_type: 'change',
		cb: (ev: MediaQueryListEvent) => void,
	): void {
		this.listeners.delete(cb);
	}

	/** Simulates a system preference change and notifies the listeners. */
	public setMatches(matches: boolean): void {
		this.matches = matches;
		const ev = {matches, media: this.media} as MediaQueryListEvent;
		for (const cb of [...this.listeners]) {
			cb(ev);
		}
	}

	public listenerCount(): number {
		return this.listeners.size;
	}
}

/** Installs a window.matchMedia mock that returns the provided MQL. */
function installMatchMedia(mql: FakeMediaQueryList): void {
	vi.stubGlobal(
		'matchMedia',
		vi.fn(() => mql as unknown as MediaQueryList),
	);
}

describe('ThemeController', () => {
	let target: HTMLElement;
	let storage: DriftpaneStorage;

	beforeEach(() => {
		localStorage.clear();
		document.body.innerHTML = '';
		target = document.createElement('div');
		document.body.appendChild(target);
		storage = new DriftpaneStorage('theme-test');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('uses `initial` when nothing is persisted', () => {
		installMatchMedia(new FakeMediaQueryList(false));
		const ctrl = new ThemeController({target, storage, initial: 'light'});
		expect(ctrl.get()).toBe('light');
		expect(target.getAttribute('data-theme')).toBe('light');
	});

	it('persisted setting wins over `initial`', () => {
		installMatchMedia(new FakeMediaQueryList(false));
		storage.writeJSON('theme', 'dark');
		const ctrl = new ThemeController({target, storage, initial: 'auto'});
		expect(ctrl.get()).toBe('dark');
		expect(target.getAttribute('data-theme')).toBe('dark');
	});

	it('ignores an invalid persisted value and falls back to `initial`', () => {
		installMatchMedia(new FakeMediaQueryList(false));
		storage.writeJSON('theme', 'banana');
		const ctrl = new ThemeController({target, storage, initial: 'light'});
		expect(ctrl.get()).toBe('light');
	});

	it('set() updates data-theme, persists, and exposes the new setting', () => {
		installMatchMedia(new FakeMediaQueryList(false));
		const ctrl = new ThemeController({target, storage, initial: 'auto'});
		ctrl.set('dark');
		expect(ctrl.get()).toBe('dark');
		expect(ctrl.resolved()).toBe('dark');
		expect(target.getAttribute('data-theme')).toBe('dark');
		// Persisted: a new instance reads it back.
		expect(storage.readJSON<DriftpaneTheme | null>('theme', null)).toBe('dark');
	});

	it('"auto" resolves from matchMedia (dark when system prefers dark)', () => {
		installMatchMedia(new FakeMediaQueryList(true));
		const ctrl = new ThemeController({target, storage, initial: 'auto'});
		expect(ctrl.get()).toBe('auto');
		expect(ctrl.resolved()).toBe('dark');
		expect(target.getAttribute('data-theme')).toBe('dark');
	});

	it('"auto" resolves to light when system prefers light', () => {
		installMatchMedia(new FakeMediaQueryList(false));
		const ctrl = new ThemeController({target, storage, initial: 'auto'});
		expect(ctrl.resolved()).toBe('light');
		expect(target.getAttribute('data-theme')).toBe('light');
	});

	it('"auto" reacts live to a system preference change', () => {
		const mql = new FakeMediaQueryList(false);
		installMatchMedia(mql);
		const ctrl = new ThemeController({target, storage, initial: 'auto'});
		expect(target.getAttribute('data-theme')).toBe('light');
		// The system switches to dark: the panel must follow it live.
		mql.setMatches(true);
		expect(target.getAttribute('data-theme')).toBe('dark');
		expect(ctrl.resolved()).toBe('dark');
	});

	it('detaches the listener when leaving "auto", reattaches when returning', () => {
		const mql = new FakeMediaQueryList(false);
		installMatchMedia(mql);
		const ctrl = new ThemeController({target, storage, initial: 'auto'});
		expect(mql.listenerCount()).toBe(1);

		// Explicit setting: the listener must be removed.
		ctrl.set('light');
		expect(mql.listenerCount()).toBe(0);
		// And a system change must no longer affect the forced theme.
		mql.setMatches(true);
		expect(target.getAttribute('data-theme')).toBe('light');

		// Returning to auto, the listener reattaches.
		ctrl.set('auto');
		expect(mql.listenerCount()).toBe(1);
		expect(target.getAttribute('data-theme')).toBe('dark');
	});

	it('dispose() removes the matchMedia listener', () => {
		const mql = new FakeMediaQueryList(true);
		installMatchMedia(mql);
		const ctrl = new ThemeController({target, storage, initial: 'auto'});
		expect(mql.listenerCount()).toBe(1);
		ctrl.dispose();
		expect(mql.listenerCount()).toBe(0);
		// After dispose, a system change no longer touches the target.
		mql.setMatches(false);
		expect(target.getAttribute('data-theme')).toBe('dark');
	});

	it('falls back to addListener/removeListener (old Safari API)', () => {
		// MQL without addEventListener: only the deprecated add/removeListener API.
		const added: ((ev: MediaQueryListEvent) => void)[] = [];
		const legacy = {
			matches: false,
			media: '(prefers-color-scheme: dark)',
			addListener(cb: (ev: MediaQueryListEvent) => void) {
				added.push(cb);
			},
			removeListener(cb: (ev: MediaQueryListEvent) => void) {
				const i = added.indexOf(cb);
				if (i >= 0) {
					added.splice(i, 1);
				}
			},
		};
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => legacy as unknown as MediaQueryList),
		);
		const ctrl = new ThemeController({target, storage, initial: 'auto'});
		expect(added).toHaveLength(1);
		ctrl.dispose();
		expect(added).toHaveLength(0);
	});

	it('is defensive when matchMedia is unavailable (auto -> dark, no throw)', () => {
		// No matchMedia: pure SSR/jsdom environment.
		vi.stubGlobal('matchMedia', undefined);
		expect(
			() => new ThemeController({target, storage, initial: 'auto'}),
		).not.toThrow();
		const ctrl = new ThemeController({target, storage, initial: 'auto'});
		// 'auto' without matchMedia resolves to the dark default of the skin.
		expect(ctrl.resolved()).toBe('dark');
		expect(target.getAttribute('data-theme')).toBe('dark');
		// set()/dispose() stay safe without a media query.
		expect(() => ctrl.set('light')).not.toThrow();
		expect(target.getAttribute('data-theme')).toBe('light');
		expect(() => ctrl.dispose()).not.toThrow();
	});

	it('explicit light/dark do not query matchMedia for resolution', () => {
		installMatchMedia(new FakeMediaQueryList(true));
		const ctrl = new ThemeController({target, storage, initial: 'light'});
		// initial 'light' must stay light even if the system prefers dark.
		expect(ctrl.resolved()).toBe('light');
		expect(target.getAttribute('data-theme')).toBe('light');
	});
});
