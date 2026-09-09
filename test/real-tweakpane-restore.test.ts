// Every other test in this suite runs against the FakePane double, which models
// importState() as a positional value copy and therefore cannot tell us whether
// a consumer's `change` handlers actually run when Driftpane restores a state.
//
// That gap is why the README used to claim the opposite of the truth. These
// tests run the real Tweakpane against the real Driftpane and lock the contract
// down: restored values DO reach the binding handlers, so a consumer does not
// have to re-apply them by hand.

import {Pane} from 'tweakpane';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane, Driftpane} from '../src/index.js';
import {DriftpaneApplyReason} from '../src/types.js';

const NS = 'real-tweakpane';

interface Harness {
	/** The object the bindings are bound to. */
	params: {speed: number; on: boolean; tint: number};
	/** Side effects recorded by the binding `change` handlers, in order. */
	applied: string[];
	pane: Pane;
}

/**
 * Builds a pane shaped like a real three.js demo: a top-level binding, a nested
 * folder, and a folder nested inside that one. Each handler records the value it
 * would have pushed into the scene.
 */
function buildPane(): Harness {
	const params = {speed: 1, on: false, tint: 0.2};
	const applied: string[] = [];
	const pane = new Pane();
	pane
		.addBinding(params, 'speed', {min: 0, max: 10})
		.on('change', (ev) => applied.push(`speed=${ev.value}`));
	const folder = pane.addFolder({title: 'Nested'});
	folder
		.addBinding(params, 'on')
		.on('change', (ev) => applied.push(`on=${ev.value}`));
	const deep = folder.addFolder({title: 'Deep'});
	deep
		.addBinding(params, 'tint', {min: 0, max: 1})
		.on('change', (ev) => applied.push(`tint=${ev.value}`));
	return {params, applied, pane};
}

/**
 * Flushes the debounced write to localStorage. Driftpane saves on a timer, so a
 * test that disposes the pane immediately would persist nothing.
 */
function flushSave(): void {
	vi.advanceTimersByTime(1000);
}

/** Runs a "session": builds a pane, attaches Driftpane, returns both. */
function session(opts: Partial<Parameters<typeof createDriftpane>[1]> = {}): {
	harness: Harness;
	drift: Driftpane;
} {
	const harness = buildPane();
	const drift = createDriftpane(harness.pane, {
		storageNamespace: NS,
		// The share flow reads window.location; keep it out of these tests.
		urlSync: false,
		...opts,
	});
	return {harness, drift};
}

describe('real Tweakpane: restoring a state applies it', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('re-fires the binding change handlers on reload, at every depth', () => {
		// Session 1: the user moves three controls, at three different depths.
		const first = session();
		first.harness.params.speed = 7;
		first.harness.params.on = true;
		first.harness.params.tint = 0.9;
		first.harness.pane.refresh();
		flushSave();
		first.harness.pane.dispose();

		// Session 2: a fresh page. The pane is rebuilt from the defaults.
		const second = session();

		// The bound object carries the saved values...
		expect(second.harness.params).toEqual({speed: 7, on: true, tint: 0.9});
		// ...and, crucially, the handlers ran, so a scene driven by them is in
		// sync rather than silently stuck on the defaults.
		expect(second.harness.applied).toEqual(['speed=7', 'on=true', 'tint=0.9']);
	});

	it('reports last=true, so handlers gated on ev.last still run', () => {
		const first = session();
		first.harness.params.speed = 4;
		first.harness.pane.refresh();
		flushSave();
		first.harness.pane.dispose();

		// Same pane shape as session 1 — Driftpane refuses to restore a snapshot
		// whose structure signature no longer matches, so the shape must match.
		const lasts: boolean[] = [];
		const harness = buildPane();
		harness.pane.children[0].on('change', (ev) => lasts.push(ev.last));
		createDriftpane(harness.pane, {storageNamespace: NS, urlSync: false});

		expect(harness.params.speed).toBe(4);
		expect(lasts).toEqual([true]);
	});

	it('fires only for values that actually differ', () => {
		const first = session();
		first.harness.params.speed = 5;
		first.harness.pane.refresh();
		flushSave();
		first.harness.pane.dispose();

		// `on` and `tint` were never touched, so restoring them is a no-op and
		// must not spam the consumer's handlers.
		const second = session();
		expect(second.harness.applied).toEqual(['speed=5']);
	});

	it('applies a preset through the handlers too', () => {
		const first = session();
		first.harness.params.speed = 8;
		first.harness.pane.refresh();
		first.drift.savePresetAs('Loud');
		const loud = first.drift.presets.list().find((p) => p.name === 'Loud');
		if (!loud) {
			throw new Error('the preset we just saved is missing');
		}

		// Move away from the preset, then apply it back.
		first.harness.applied.length = 0;
		first.harness.params.speed = 2;
		first.harness.pane.refresh();
		first.drift.applyPreset(loud.id);

		expect(first.harness.params.speed).toBe(8);
		expect(first.harness.applied).toContain('speed=8');
	});
});

describe('onStateApplied', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('fires with reason "restore" after a reload, once', () => {
		const first = session();
		first.harness.params.speed = 3;
		first.harness.pane.refresh();
		flushSave();
		first.harness.pane.dispose();

		const reasons: DriftpaneApplyReason[] = [];
		session({onStateApplied: (r) => reasons.push(r)});

		expect(reasons).toEqual(['restore']);
	});

	it('does not fire when there is nothing to restore', () => {
		const reasons: DriftpaneApplyReason[] = [];
		session({onStateApplied: (r) => reasons.push(r)});
		expect(reasons).toEqual([]);
	});

	it('fires with reason "preset" when a preset is applied', () => {
		const reasons: DriftpaneApplyReason[] = [];
		const {harness, drift} = session({
			onStateApplied: (r) => reasons.push(r),
		});
		harness.params.speed = 6;
		harness.pane.refresh();
		drift.savePresetAs('Six');
		const six = drift.presets.list().find((p) => p.name === 'Six');
		if (!six) {
			throw new Error('the preset we just saved is missing');
		}
		harness.params.speed = 1;
		harness.pane.refresh();
		reasons.length = 0;

		drift.applyPreset(six.id);
		expect(reasons).toEqual(['preset']);
	});

	it('swallows a throwing callback rather than breaking startup', () => {
		const first = session();
		first.harness.params.speed = 3;
		first.harness.pane.refresh();
		flushSave();
		first.harness.pane.dispose();

		expect(() =>
			session({
				onStateApplied: () => {
					throw new Error('consumer bug');
				},
			}),
		).not.toThrow();
	});
});
