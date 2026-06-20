import {describe, expect, it} from 'vitest';

import {applyMaxHeight, clearMaxHeight} from '../src/scroll.js';

const SCROLL_CLASS = 'driftpane-scroll';
const MAX_HEIGHT_VAR = '--dp-max-height';

/** Creates a host (the root panel) as a jsdom element. */
function makeHost(): HTMLElement {
	return document.createElement('div');
}

describe('applyMaxHeight', () => {
	it('applies the class and variable to the host', () => {
		const host = makeHost();
		applyMaxHeight(host, '80vh');
		expect(host.classList.contains(SCROLL_CLASS)).toBe(true);
		expect(host.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe('80vh');
	});

	it('accepts an arbitrary CSS length (calc with dvh)', () => {
		const host = makeHost();
		applyMaxHeight(host, 'calc(100dvh - 48px)');
		expect(host.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe(
			'calc(100dvh - 48px)',
		);
		expect(host.classList.contains(SCROLL_CLASS)).toBe(true);
	});

	it('accepts a length in px', () => {
		const host = makeHost();
		applyMaxHeight(host, '400px');
		expect(host.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe('400px');
	});

	it('is a no-op with an empty string', () => {
		const host = makeHost();
		applyMaxHeight(host, '');
		expect(host.classList.contains(SCROLL_CLASS)).toBe(false);
		expect(host.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe('');
	});

	it('is a no-op with a whitespace-only string', () => {
		const host = makeHost();
		applyMaxHeight(host, '   ');
		expect(host.classList.contains(SCROLL_CLASS)).toBe(false);
		expect(host.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe('');
	});

	it('overwrites the value on a second call', () => {
		const host = makeHost();
		applyMaxHeight(host, '80vh');
		applyMaxHeight(host, '400px');
		expect(host.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe('400px');
	});
});

describe('clearMaxHeight', () => {
	it('removes the class and variable', () => {
		const host = makeHost();
		applyMaxHeight(host, '80vh');
		clearMaxHeight(host);
		expect(host.classList.contains(SCROLL_CLASS)).toBe(false);
		expect(host.style.getPropertyValue(MAX_HEIGHT_VAR)).toBe('');
	});

	it('is safe to call without a previous applyMaxHeight', () => {
		const host = makeHost();
		expect(() => clearMaxHeight(host)).not.toThrow();
		expect(host.classList.contains(SCROLL_CLASS)).toBe(false);
	});
});
