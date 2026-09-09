import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DriftpaneStorage, isStorageAvailable} from '../src/storage.js';

describe('isStorageAvailable', () => {
	beforeEach(() => {
		localStorage.clear();
	});

	it('returns true with a working localStorage (jsdom)', () => {
		expect(isStorageAvailable()).toBe(true);
	});

	it('returns false when setItem throws', () => {
		const spy = vi
			.spyOn(Storage.prototype, 'setItem')
			.mockImplementation(() => {
				throw new Error('QuotaExceeded');
			});
		expect(isStorageAvailable()).toBe(false);
		spy.mockRestore();
	});
});

describe('DriftpaneStorage', () => {
	beforeEach(() => {
		localStorage.clear();
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('namespaces keys as driftpane:<ns>:<suffix>', () => {
		const s = new DriftpaneStorage('app');
		expect(s.keyFor('state')).toBe('driftpane:app:state');
		expect(s.keyFor('presets')).toBe('driftpane:app:presets');
	});

	it('isolates namespaces from one another', () => {
		const a = new DriftpaneStorage('a');
		const b = new DriftpaneStorage('b');
		a.writeJSON('k', {v: 1});
		b.writeJSON('k', {v: 2});
		expect(a.readJSON('k', null)).toEqual({v: 1});
		expect(b.readJSON('k', null)).toEqual({v: 2});
	});

	it('round-trips JSON values', () => {
		const s = new DriftpaneStorage('rt');
		const value = {a: 1, b: ['x', 'y'], c: {nested: true}};
		s.writeJSON('thing', value);
		expect(s.readJSON('thing', null)).toEqual(value);
	});

	it('returns the fallback for a missing key', () => {
		const s = new DriftpaneStorage('miss');
		expect(s.readJSON('nope', 'fallback')).toBe('fallback');
	});

	it('returns the fallback for malformed JSON', () => {
		const s = new DriftpaneStorage('bad');
		localStorage.setItem('driftpane:bad:broken', '{not json');
		expect(s.readJSON('broken', 42)).toBe(42);
	});

	it('remove() deletes a key', () => {
		const s = new DriftpaneStorage('rm');
		s.writeJSON('k', 1);
		expect(s.readJSON('k', null)).toBe(1);
		s.remove('k');
		expect(s.readJSON('k', 'gone')).toBe('gone');
	});

	it('degrades to a no-op when storage is unavailable', () => {
		// Force isStorageAvailable() to be false at construction time.
		const setSpy = vi
			.spyOn(Storage.prototype, 'setItem')
			.mockImplementation(() => {
				throw new Error('unavailable');
			});
		const s = new DriftpaneStorage('na');
		setSpy.mockRestore();

		// All operations must be safe no-ops and reads return the fallback.
		expect(() => s.writeJSON('k', {a: 1})).not.toThrow();
		expect(s.readJSON('k', 'fallback')).toBe('fallback');
		expect(() => s.remove('k')).not.toThrow();
	});

	it('writeJSON swallows setItem errors (quota) without throwing', () => {
		// Storage IS available at construction (probe passes normally).
		const s = new DriftpaneStorage('quota');
		// Now make the actual write throw (e.g. quota exceeded).
		const spy = vi
			.spyOn(Storage.prototype, 'setItem')
			.mockImplementation(() => {
				throw new Error('Quota');
			});
		expect(() => s.writeJSON('k', {a: 1})).not.toThrow();
		spy.mockRestore();
	});
});
