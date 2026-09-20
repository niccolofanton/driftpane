import {Pane} from 'tweakpane';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';

import {createDriftpane} from '../src/driftpane.js';
import {PersistenceController} from '../src/persistence.js';
import {DriftpaneStorage} from '../src/storage.js';
import {SerializedState} from '../src/types.js';

const cleanup: Array<() => void> = [];
beforeEach(() => {
	localStorage.clear();
	vi.useFakeTimers();
});
afterEach(() => {
	cleanup
		.splice(0)
		.reverse()
		.forEach((fn) => fn());
	vi.useRealTimers();
});
function setup() {
	const pane = new Pane({title: 'Adversarial'});
	cleanup.push(() => pane.dispose());
	const params = {first: 1, second: 2};
	pane.addBinding(params, 'first');
	const folder = pane.addFolder({title: 'Nested'});
	folder.addBinding(params, 'second');
	const storage = new DriftpaneStorage('adversarial');
	const persistence = new PersistenceController(pane, storage, {
		managerChildIndex: -1,
		debounceMs: 100,
	});
	cleanup.push(() => persistence.dispose());
	return {pane, params, folder, storage, persistence};
}
it('rejects a partial invalid saved state without applying its valid prefix', () => {
	const {pane, params, storage, persistence} = setup();
	const state = pane.exportState();
	const children = state.children as SerializedState[];
	(children[0].binding as Record<string, unknown>).value = 99;
	delete children[1].expanded;
	storage.writeJSON('state', state);
	expect(persistence.restore()).toBe(false);
	expect(params.first).toBe(1);
});
it('keeps resetState cleared when invoked from a pane button', () => {
	const pane = new Pane({title: 'Reset'});
	cleanup.push(() => pane.dispose());
	pane.addBinding({value: 9}, 'value');
	const button = pane.addButton({title: 'Reset state'});
	const drift = createDriftpane(pane, {
		storageNamespace: 'reset',
		draggable: false,
		urlSync: false,
		presetsEnabled: false,
		debounceMs: 100,
	});
	cleanup.push(() => drift.dispose());
	drift.exportAllJSON();
	button.on('click', () => drift.resetState());
	const resetButton = button.element.querySelector('button');
	expect(resetButton).not.toBeNull();
	resetButton?.click();
	vi.advanceTimersByTime(200);
	expect(localStorage.getItem('driftpane:reset:state')).toBeNull();
});
it('saves an immediately folded folder added after initialization', async () => {
	const {pane, storage} = setup();
	const added = pane.addFolder({title: 'Runtime'});
	added.expanded = false;
	await Promise.resolve();
	vi.advanceTimersByTime(200);
	const state = storage.readJSON<SerializedState>('state', {});
	expect(state.children).toEqual(
		expect.arrayContaining([
			expect.objectContaining({title: 'Runtime', expanded: false}),
		]),
	);
});

it('ignores an invalid saved height and rejects invalid runtime and backup caps', () => {
	const pane = new Pane({title: 'Height'});
	cleanup.push(() => pane.dispose());
	localStorage.setItem('driftpane:height:maxHeight', JSON.stringify('none'));
	const drift = createDriftpane(pane, {
		storageNamespace: 'height',
		urlSync: false,
		presetsEnabled: false,
		draggable: false,
	});
	cleanup.push(() => drift.dispose());
	expect(pane.element.style.getPropertyValue('--dp-max-height')).toBe(
		'calc(100dvh - 48px)',
	);
	for (const height of [NaN, Infinity, 'garbage', 'none']) {
		expect(() => drift.setMaxHeight(height)).toThrow();
		expect(pane.element.style.getPropertyValue('--dp-max-height')).toBe(
			'calc(100dvh - 48px)',
		);
	}
	expect(() =>
		drift.importAllJSON(
			JSON.stringify({
				format: 'driftpane-backup',
				version: 1,
				data: {maxHeight: 'none'},
			}),
		),
	).toThrow();
});

it('does not mark a preset as edited when only readonly monitors change', () => {
	const pane = new Pane({title: 'Monitor'});
	cleanup.push(() => pane.dispose());
	const values = {speed: 1, fps: 0};
	pane.addBinding(values, 'speed');
	pane.addBinding(values, 'fps', {readonly: true});
	const drift = createDriftpane(pane, {
		storageNamespace: 'monitor-dirty',
		urlSync: false,
		draggable: false,
	});
	cleanup.push(() => drift.dispose());
	values.fps = 60;
	pane.refresh();
	expect(drift.presets.isModified()).toBe(false);
	values.speed = 2;
	pane.refresh();
	expect(drift.presets.isModified()).toBe(true);
});
