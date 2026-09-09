import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {debounce} from '../src/debounce.js';

describe('debounce', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('invokes only once after the wait window (trailing edge)', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d();
		d();
		d();
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(99);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('resets the timer on each call', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d();
		vi.advanceTimersByTime(80);
		d(); // restart
		vi.advanceTimersByTime(80);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(20);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('passes the LAST arguments through', () => {
		const fn = vi.fn();
		const d = debounce(fn as (...a: number[]) => void, 50);
		d(1);
		d(2);
		d(3);
		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith(3);
	});

	it('flush() runs the pending call immediately and clears the timer', () => {
		const fn = vi.fn();
		const d = debounce(fn as (...a: string[]) => void, 100);
		d('x');
		d.flush();
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith('x');
		// No second call when the timer would have fired.
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it('flush() with nothing pending is a no-op', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d.flush();
		expect(fn).not.toHaveBeenCalled();
	});

	it('cancel() prevents the pending call', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d();
		d.cancel();
		vi.advanceTimersByTime(200);
		expect(fn).not.toHaveBeenCalled();
	});

	it('cancel() then flush() does nothing', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d();
		d.cancel();
		d.flush();
		expect(fn).not.toHaveBeenCalled();
	});

	it('can be reused after a flush', () => {
		const fn = vi.fn();
		const d = debounce(fn, 100);
		d();
		d.flush();
		d();
		vi.advanceTimersByTime(100);
		expect(fn).toHaveBeenCalledTimes(2);
	});
});
