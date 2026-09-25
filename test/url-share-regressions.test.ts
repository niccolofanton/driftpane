import {
	CompressionStream as NativeCompressionStream,
	DecompressionStream as NativeDecompressionStream,
} from 'node:stream/web';

import {Pane} from 'tweakpane';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane} from '../src/driftpane.js';
import {stripExpanded, stripReadonly} from '../src/state-scope.js';
import {DriftpaneShareEnvelope} from '../src/types.js';
import {
	decodeEnvelope,
	encodeEnvelope,
	UrlShareController,
} from '../src/url-share.js';

const cleanup: Array<() => void> = [];
const PARAM = 'dp:url-regressions';

function setup() {
	const pane = new Pane();
	const values = {speed: 1, size: 2};
	pane.addBinding(values, 'speed');
	pane.addBinding(values, 'size');
	const applied = vi.fn();
	const drift = createDriftpane(pane, {
		storageNamespace: 'url-regressions',
		draggable: false,
		debounceMs: 20,
		onStateApplied: applied,
	});
	cleanup.push(() => {
		drift.dispose();
		pane.dispose();
	});
	return {pane, values, drift, applied};
}

async function currentEnvelope(): Promise<DriftpaneShareEnvelope> {
	const value = new URL(window.location.href).searchParams.get(PARAM);
	expect(value).not.toBeNull();
	return (await decodeEnvelope(value ?? '')) as DriftpaneShareEnvelope;
}

beforeEach(() => {
	localStorage.clear();
	window.history.replaceState({}, '', '/?host=keep#anchor');
	vi.useFakeTimers();
	vi.stubGlobal('CompressionStream', undefined);
});
afterEach(() => {
	cleanup
		.splice(0)
		.reverse()
		.forEach((dispose) => dispose());
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('share URL regressions', () => {
	it('updates an existing URL from Default to the newly saved custom identity', async () => {
		const {pane, values, drift} = setup();
		values.speed = 5;
		pane.refresh();
		await vi.advanceTimersByTimeAsync(20);
		expect((await currentEnvelope()).d).toBe(true);

		drift.savePresetAs('Custom');
		await vi.advanceTimersByTimeAsync(20);
		expect(await currentEnvelope()).toMatchObject({
			n: 'Custom',
			d: false,
			id: drift.presets.activeId(),
		});
	});

	it('updates the shared name when a preset is renamed without changing values', async () => {
		const {drift} = setup();
		const saved = drift.presets.save('Before');
		await vi.advanceTimersByTimeAsync(20);
		expect((await currentEnvelope()).n).toBe('Before');
		drift.presets.rename(saved.id, 'After');
		await vi.advanceTimersByTimeAsync(20);
		expect(await currentEnvelope()).toMatchObject({n: 'After', id: saved.id});
	});

	it('updates the shared UUID when selecting a preset with identical values', async () => {
		const {drift} = setup();
		const first = drift.presets.save('First');
		const second = drift.presets.save('Second');
		await vi.advanceTimersByTimeAsync(20);
		expect((await currentEnvelope()).id).toBe(second.id);
		drift.applyPreset(first.id);
		await vi.advanceTimersByTimeAsync(20);
		expect(await currentEnvelope()).toMatchObject({n: 'First', id: first.id});
	});

	it('clear cancels pending edits and permits sharing again only after another change', async () => {
		const {pane, values, drift} = setup();
		await drift.copyShareLink();
		values.speed = 5;
		pane.refresh();
		drift.clearShareUrl();
		await vi.advanceTimersByTimeAsync(100);
		const cleared = new URL(window.location.href);
		expect(cleared.searchParams.has(PARAM)).toBe(false);
		expect(cleared.searchParams.get('host')).toBe('keep');
		expect(cleared.hash).toBe('#anchor');

		values.speed = 6;
		pane.refresh();
		await vi.advanceTimersByTimeAsync(20);
		expect((await currentEnvelope()).s['children']).toEqual(
			expect.arrayContaining([
				expect.objectContaining({binding: {key: 'speed', value: 6}}),
			]),
		);
	});

	it('clear invalidates an encode already in flight', async () => {
		const controller = new UrlShareController(
			{on: () => undefined},
			{
				paramKey: PARAM,
				debounceMs: 20,
				getSnapshot: () => ({children: []}),
				getIdentity: () => ({name: 'Default', isDefault: true}),
			},
		);
		cleanup.push(() => controller.dispose());
		const pending = controller.writeNow();
		controller.clear();
		await pending;
		expect(controller.hasIncomingParam()).toBe(false);
		expect(new URL(window.location.href).searchParams.get('host')).toBe('keep');
	});

	it('does not publish an explicit copy while an incoming preview is suspended', async () => {
		const original = window.location.href;
		const controller = new UrlShareController(
			{on: () => undefined},
			{
				paramKey: 'dp:separate-preview',
				debounceMs: 20,
				getSnapshot: () => ({children: []}),
				getIdentity: () => ({name: 'Preview', isDefault: true}),
			},
		);
		cleanup.push(() => controller.dispose());
		controller.suspend();
		expect(await controller.writeNow()).toBe(original);
		expect(window.location.href).toBe(original);
	});

	it('dispose during incoming decoding prevents state mutation and share callbacks', async () => {
		const source = new Pane();
		const values = {speed: 9, size: 8};
		source.addBinding(values, 'speed');
		source.addBinding(values, 'size');
		const value = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			n: 'Other',
			d: true,
			s: stripReadonly(stripExpanded(source.exportState())),
		});
		source.dispose();
		const url = new URL(window.location.href);
		url.searchParams.set(PARAM, value);
		window.history.replaceState({}, '', url.toString());
		const receiver = setup();
		receiver.drift.dispose();
		await vi.advanceTimersByTimeAsync(100);
		expect(receiver.values).toEqual({speed: 1, size: 2});
		expect(receiver.applied).not.toHaveBeenCalled();
		expect(receiver.pane.element.querySelector('.dp-share-card')).toBeNull();
	});

	it.each(['debouncing', 'encoding'] as const)(
		'resumes a %s URL update after a backup import rolls back',
		async (phase) => {
			const {pane, values, drift} = setup();
			const backup = JSON.parse(drift.exportAllJSON());
			backup.data.presets = {presets: [null]};
			values.speed = 7;
			pane.refresh();
			if (phase === 'encoding') {
				// Run only the timer callback, leaving its async encode pending.
				vi.advanceTimersByTime(20);
			}
			expect(() => drift.importAllJSON(JSON.stringify(backup))).toThrow();
			expect(values.speed).toBe(7);
			await vi.advanceTimersByTimeAsync(40);
			expect((await currentEnvelope()).s['children']).toEqual(
				expect.arrayContaining([
					expect.objectContaining({binding: {key: 'speed', value: 7}}),
				]),
			);
			const stored = JSON.parse(
				localStorage.getItem('driftpane:url-regressions:state') ?? '{}',
			);
			expect(stored.children[0].binding.value).toBe(7);
		},
	);

	it.each(['clear', 'dispose'] as const)(
		'%s cancels a suspended in-flight write permanently',
		async (action) => {
			const controller = new UrlShareController(
				{on: () => undefined},
				{
					paramKey: PARAM,
					debounceMs: 20,
					getSnapshot: () => ({children: []}),
					getIdentity: () => ({name: 'Default', isDefault: true}),
				},
			);
			cleanup.push(() => controller.dispose());
			const pending = controller.writeNow();
			controller.suspend();
			controller[action]();
			controller.resume();
			await pending;
			await vi.advanceTimersByTimeAsync(40);
			expect(controller.hasIncomingParam()).toBe(false);
		},
	);

	it('handles corrupt native compressed input without an unhandled writer rejection', async () => {
		vi.useRealTimers();
		vi.stubGlobal('CompressionStream', NativeCompressionStream);
		vi.stubGlobal('DecompressionStream', NativeDecompressionStream);
		const valid = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			n: 'Default',
			d: true,
			s: {children: []},
		});
		expect(valid[0]).toBe('c');
		await expect(decodeEnvelope('cAA')).rejects.toThrow();
		// Give the native writable rejection a turn to surface. Vitest fails this
		// test run if a second, unobserved rejection escapes the decoder.
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
});
