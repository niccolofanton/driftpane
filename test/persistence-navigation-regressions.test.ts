import {Pane} from 'tweakpane';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane} from '../src/driftpane.js';
import {PersistenceController} from '../src/persistence.js';
import {PresetController} from '../src/presets.js';
import {
	buildSharedImport,
	importPaneState,
	mergeByPath,
	stripExpanded,
} from '../src/state-scope.js';
import {DriftpaneStorage} from '../src/storage.js';
import {DriftpaneShareEnvelope, SerializedState} from '../src/types.js';
import {decodeEnvelope} from '../src/url-share.js';

const cleanup: Array<() => void> = [];

function makePane(): Pane {
	const pane = new Pane();
	cleanup.push(() => pane.dispose());
	return pane;
}

function persistence(pane: Pane, namespace: string): PersistenceController {
	const controller = new PersistenceController(
		pane,
		new DriftpaneStorage(namespace),
		{debounceMs: 100, managerChildIndex: -1},
	);
	cleanup.push(() => controller.dispose());
	return controller;
}

beforeEach(() => {
	localStorage.clear();
	window.history.replaceState({}, '', '/');
	vi.useFakeTimers();
});
afterEach(() => {
	cleanup
		.splice(0)
		.reverse()
		.forEach((dispose) => dispose());
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe('persistence and navigation regressions with real Tweakpane', () => {
	it('rejects reordered same-key bindings with distinct labels', () => {
		const first = makePane();
		first.addBinding({value: 10}, 'value', {label: 'Object A'});
		first.addBinding({value: 20}, 'value', {label: 'Object B'});
		persistence(first, 'reorder').saveNow();

		const second = makePane();
		const a = {value: 1};
		const b = {value: 2};
		const bBinding = second.addBinding(b, 'value', {label: 'Object B'});
		second.addBinding(a, 'value', {label: 'Object A'});
		expect(persistence(second, 'reorder').restore()).toBe(false);
		expect(a.value).toBe(1);
		expect(b.value).toBe(2);
		expect(bBinding.label).toBe('Object B');
	});

	it('restores nested tabs and allows selecting the previous page by click', () => {
		const setup = (): ReturnType<Pane['addTab']> => {
			const pane = makePane();
			const tabs = pane.addFolder({title: 'Outer'}).addTab({
				pages: [{title: 'One'}, {title: 'Two'}],
			});
			tabs.pages[1]
				.addFolder({title: 'Nested'})
				.addBinding({value: 1}, 'value');
			const controller = persistence(pane, 'tabs');
			controller.restore();
			return tabs;
		};
		const first = setup();
		first.pages[1].selected = true;
		vi.advanceTimersByTime(100);
		const second = setup();
		expect(second.pages.map((page) => page.selected)).toEqual([false, true]);
		expect(second.pages.map((page) => page.hidden)).toEqual([true, false]);
		second.element.querySelectorAll('button')[0].click();
		expect(second.pages.map((page) => page.selected)).toEqual([true, false]);
		expect(second.pages.map((page) => page.hidden)).toEqual([false, true]);
	});

	it('keeps tab navigation global when comparing and applying presets', () => {
		const pane = makePane();
		const tabs = pane.addTab({pages: [{title: 'One'}, {title: 'Two'}]});
		const values = {value: 1};
		tabs.pages[0].addBinding(values, 'value');
		const presets = new PresetController(
			pane,
			new DriftpaneStorage('preset-tabs'),
			{
				managerChildIndex: -1,
			},
		);
		const saved = presets.save('One');
		tabs.pages[1].selected = true;
		expect(presets.isModified()).toBe(false);
		values.value = 9;
		pane.refresh();
		expect(presets.apply(saved.id)).toBe(true);
		expect(values.value).toBe(1);
		expect(tabs.pages.map((page) => page.selected)).toEqual([false, true]);
		expect(tabs.pages.map((page) => page.hidden)).toEqual([true, false]);
	});

	it('ignores navigation fields in legacy stored custom presets', () => {
		const pane = makePane();
		const tabs = pane.addTab({pages: [{title: 'One'}, {title: 'Two'}]});
		tabs.pages[0].addBinding({value: 1}, 'value');
		const storage = new DriftpaneStorage('legacy-tabs');
		storage.writeJSON('presets', {
			version: 1,
			activeId: 'legacy',
			presets: [
				{
					id: 'legacy',
					name: 'Legacy',
					createdAt: 1,
					updatedAt: 1,
					custom: true,
					state: pane.exportState(),
				},
			],
		});
		const presets = new PresetController(pane, storage, {
			managerChildIndex: -1,
		});
		tabs.pages[1].selected = true;
		expect(presets.isModified()).toBe(false);
		expect(presets.apply('legacy')).toBe(true);
		expect(tabs.pages.map((page) => page.selected)).toEqual([false, true]);
	});

	it('keeps current tab navigation when applying an older shared snapshot', () => {
		const pane = makePane();
		const tabs = pane.addTab({pages: [{title: 'One'}, {title: 'Two'}]});
		const snapshot = pane.exportState();
		tabs.pages[1].selected = true;
		expect(
			importPaneState(
				pane,
				buildSharedImport(pane.exportState(), snapshot, -1),
			),
		).toBe(true);
		expect(tabs.pages.map((page) => page.selected)).toEqual([false, true]);
		expect(tabs.pages.map((page) => page.hidden)).toEqual([true, false]);
	});

	it('saves editable changes during continuous readonly monitor updates', () => {
		const pane = makePane();
		const values = {speed: 1, fps: 60};
		pane.addBinding(values, 'speed');
		pane.addBinding(values, 'fps', {readonly: true, interval: 0});
		persistence(pane, 'monitor');
		values.speed = 8;
		pane.refresh();
		for (let index = 0; index < 20; index++) {
			values.fps = index;
			pane.refresh();
			vi.advanceTimersByTime(16);
		}
		const stored = new DriftpaneStorage('monitor').readJSON<{
			children: Array<{binding: {value: number}}>;
		}>('state', {children: []});
		expect(stored.children[0].binding.value).toBe(8);
	});

	it('attaches programmatic fold listeners to folders added after initialization', async () => {
		const pane = makePane();
		const controller = persistence(pane, 'dynamic-fold');
		const folder = pane.addFolder({title: 'Added later'});
		await Promise.resolve();
		const writes = vi.spyOn(controller, 'saveNow');
		folder.expanded = false;
		vi.advanceTimersByTime(100);
		expect(writes).toHaveBeenCalledTimes(1);
		await Promise.resolve();
		folder.expanded = true;
		vi.advanceTimersByTime(100);
		expect(writes).toHaveBeenCalledTimes(2);
	});

	it('tracks the actual manager after controls are added and reordered through the facade', async () => {
		const pane = makePane();
		pane.addBinding({base: 1}, 'base');
		const drift = createDriftpane(pane, {
			storageNamespace: 'dynamic-manager',
			draggable: false,
			urlSync: true,
			debounceMs: 100,
		});
		cleanup.push(() => drift.dispose());
		const values = {extra: 1};
		pane.addBinding(values, 'extra');
		// A user folder named exactly like the manager must not be stripped.
		const outer = pane.addFolder({title: 'Preset', index: 0});
		const nested = outer.addFolder({title: 'Nested'});
		await Promise.resolve();
		nested.expanded = false;
		values.extra = 9;
		pane.refresh();
		vi.advanceTimersByTime(100);
		const stored = new DriftpaneStorage(
			'dynamic-manager',
		).readJSON<SerializedState>('state', {});
		const snapshot = drift.presets.currentSnapshot();
		expect(stored['children']).toHaveLength(3);
		expect(snapshot['children']).toHaveLength(3);
		expect((stored['children'] as SerializedState[])[0]).toMatchObject({
			title: 'Preset',
			children: [{title: 'Nested', expanded: false}],
		});
		expect((stored['children'] as SerializedState[])[2]).toMatchObject({
			binding: {key: 'extra', value: 9},
		});
		const saved = drift.presets.save('Dynamic controls');
		values.extra = 2;
		pane.refresh();
		drift.applyPreset(saved.id);
		expect(values.extra).toBe(9);
		expect(nested.expanded).toBe(false);
		const url = new URL(await drift.shareUrl());
		const envelope = (await decodeEnvelope(
			url.searchParams.get('dp:dynamic-manager') ?? '',
		)) as DriftpaneShareEnvelope;
		expect(envelope.s['children']).toHaveLength(3);
		expect((envelope.s['children'] as SerializedState[])[2]).toMatchObject({
			binding: {key: 'extra', value: 9},
		});
	});

	it('strips only tab-derived hidden fields, preserving ordinary blade visibility', () => {
		const state = {
			children: [
				{title: 'Page', selected: true, hidden: false, children: []},
				{label: 'Secret', hidden: true, binding: {key: 'secret', value: 1}},
			],
		};
		expect(stripExpanded(state)).toEqual({
			children: [{title: 'Page', children: []}, state.children[1]],
		});
	});

	it('does not broadcast a unique source value to ambiguous target paths', () => {
		const target = {
			children: [
				{binding: {key: 'value', value: 1}},
				{binding: {key: 'value', value: 2}},
			],
		};
		const source = {children: [{binding: {key: 'value', value: 9}}]};
		expect(mergeByPath(target, source)).toEqual(target);
	});
});
