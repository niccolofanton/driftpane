import {Pane} from 'tweakpane';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane, Driftpane} from '../src/index.js';

const sessions: {pane: Pane; drift: Driftpane}[] = [];
function session(namespace: string, factorySpeed = 1) {
	const params = {speed: factorySpeed, enabled: true};
	const pane = new Pane({title: 'Backup test'});
	pane.addBinding(params, 'speed');
	const folder = pane.addFolder({title: 'Options'});
	const tabs = folder.addTab({pages: [{title: 'One'}, {title: 'Two'}]});
	tabs.pages[1].addBinding(params, 'enabled');
	const applied = vi.fn();
	const drift = createDriftpane(pane, {
		storageNamespace: namespace,
		urlSync: false,
		showThemeControl: true,
		showExportAll: true,
		clampToViewport: false,
		onStateApplied: applied,
	});
	sessions.push({pane, drift});
	return {pane, params, folder, tabs, drift, applied};
}

function stored(namespace: string): Record<string, string | null> {
	return Object.fromEntries(
		Object.keys(localStorage)
			.filter((key) => key.startsWith(`driftpane:${namespace}:`))
			.sort()
			.map((key) => [key, localStorage.getItem(key)]),
	);
}

beforeEach(() => {
	localStorage.clear();
	window.history.replaceState({}, '', '/');
	vi.useFakeTimers();
});
afterEach(() => {
	for (const {pane, drift} of sessions.splice(0)) {
		drift.dispose();
		pane.dispose();
	}
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('real Tweakpane: namespace backup import/export', () => {
	it('roundtrips current values, navigation, layout, theme and the active custom preset', () => {
		const source = session('backup-source');
		source.params.speed = 8;
		source.params.enabled = false;
		source.pane.refresh();
		source.drift.savePresetAs('Eight');
		const savedId = source.drift.presets.activeId();
		source.tabs.pages[1].selected = true;
		source.folder.expanded = false;
		source.drift.draggable.setPosition({x: 80, y: 90});
		source.drift.draggable.setWidth(420);
		source.drift.setMaxHeight('510px');
		source.drift.theme.set('light');
		// Export before the pending state debounce fires.
		const backup = source.drift.exportAllJSON();
		const target = session('backup-target');
		target.drift.importAllJSON(backup);
		expect(target.params).toEqual({speed: 8, enabled: false});
		expect(target.folder.expanded).toBe(false);
		expect(target.tabs.pages.map((page) => page.selected)).toEqual([
			false,
			true,
		]);
		expect(target.tabs.pages.map((page) => page.hidden)).toEqual([true, false]);
		expect(target.drift.draggable.getPosition()).toEqual({x: 80, y: 90});
		expect(target.drift.draggable.getWidth()).toBe(420);
		expect(target.pane.element.style.getPropertyValue('--dp-max-height')).toBe(
			'510px',
		);
		expect(target.drift.theme.get()).toBe('light');
		expect(target.drift.presets.activeId()).toBe(savedId);
		expect(target.drift.presets.isModified()).toBe(false);
		expect(target.applied.mock.calls).toEqual([['restore']]);
		const roundtrip = JSON.parse(target.drift.exportAllJSON());
		const original = JSON.parse(backup);
		for (const field of ['state', 'position', 'width', 'maxHeight', 'theme']) {
			expect(roundtrip.data[field]).toEqual(original.data[field]);
		}
		// Restored state is immediately persisted, including selection model.
		const reload = session('backup-target');
		expect(reload.params).toEqual(target.params);
		expect(reload.tabs.pages[1].selected).toBe(true);
		expect(reload.drift.presets.activeId()).toBe(savedId);
	});

	it('preserves the current factory Default when restoring a backup from an older build', () => {
		const old = session('older-build', 1);
		const backup = old.drift.exportAllJSON();
		const current = session('current-build', 5);
		const defaultId = current.drift.presets.activeId();
		current.drift.importAllJSON(backup);
		expect(current.params.speed).toBe(1); // backup's live configuration
		expect(current.drift.presets.activeId()).toBe(defaultId);
		expect(current.drift.presets.revert()).toBe(true);
		expect(current.params.speed).toBe(5); // current application's baseline
	});

	it('rejects invalid settings, structure and preset collections without changing state or storage', () => {
		const source = session('invalid-source');
		source.params.speed = 8;
		source.pane.refresh();
		const valid = JSON.parse(source.drift.exportAllJSON());
		const target = session('invalid-target');
		target.drift.savePresetAs('Keep');
		target.drift.exportAllJSON();
		const paneBefore = target.pane.exportState();
		const storeBefore = stored('invalid-target');
		const variants = [
			{...valid, version: 2},
			{...valid, data: {...valid.data, width: -1}},
			{...valid, data: {...valid.data, theme: 'unknown'}},
			{...valid, data: {...valid.data, state: {children: []}}},
			{...valid, data: {...valid.data, presets: {presets: [null]}}},
		];
		for (const invalid of variants) {
			expect(() =>
				target.drift.importAllJSON(JSON.stringify(invalid)),
			).toThrow();
			expect(target.pane.exportState()).toEqual(paneBefore);
			expect(stored('invalid-target')).toEqual(storeBefore);
			expect(target.params.speed).toBe(1);
		}
	});

	it('preserves the pending save of user edits when a backup import fails', () => {
		const target = session('pending-target');
		const backup = JSON.parse(target.drift.exportAllJSON());
		target.params.speed = 3;
		target.pane.refresh();
		backup.data.presets = {presets: [null]};
		expect(() => target.drift.importAllJSON(JSON.stringify(backup))).toThrow();
		expect(target.params.speed).toBe(3);
		vi.advanceTimersByTime(1000);
		const persisted = JSON.parse(
			localStorage.getItem('driftpane:pending-target:state') ?? '{}',
		);
		expect(persisted.children[0].binding.value).toBe(3);
	});

	it('imports only into the receiving namespace and leaves the source namespace untouched', () => {
		const source = session('namespace-source');
		source.params.speed = 8;
		source.pane.refresh();
		source.drift.savePresetAs('Eight');
		const backup = source.drift.exportAllJSON();
		const sourceStore = stored('namespace-source');
		const target = session('namespace-target');
		target.drift.importAllJSON(backup);
		expect(target.params.speed).toBe(8);
		expect(stored('namespace-source')).toEqual(sourceStore);
		expect(
			JSON.parse(
				localStorage.getItem('driftpane:namespace-target:presets') ?? '{}',
			).activeId,
		).toBe(source.drift.presets.activeId());
	});

	it('routes a selected backup file through the menu Import action', () => {
		const source = session('menu-source');
		source.params.speed = 9;
		source.pane.refresh();
		const backup = source.drift.exportAllJSON();
		const target = session('menu-target');
		const input = Array.from(
			document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
		).at(-1);
		if (!input) throw new Error('Missing menu input');
		const read = vi.fn();
		vi.stubGlobal(
			'FileReader',
			class {
				public result = backup;
				public onload: (() => void) | null = null;
				public readAsText(file: File): void {
					read(file);
					this.onload?.();
				}
			},
		);
		const file = new File([backup], 'backup.json', {type: 'application/json'});
		Object.defineProperty(input, 'files', {value: [file], configurable: true});
		input.dispatchEvent(new Event('change'));
		expect(read).toHaveBeenCalledWith(file);
		expect(target.params.speed).toBe(9);
		expect(target.applied.mock.calls).toEqual([['restore']]);
		expect(document.querySelector('[data-driftpane-toast]')?.textContent).toBe(
			'Backup restored.',
		);
	});
});
