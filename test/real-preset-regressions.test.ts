import {Pane} from 'tweakpane';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane, Driftpane} from '../src/index.js';
import {DriftpaneOptions} from '../src/types.js';

const sessions: {pane: Pane; drift: Driftpane}[] = [];
function session(initial = 1, extra = false, options: DriftpaneOptions = {}) {
	const pane = new Pane();
	const params = {speed: initial, extra: 10};
	pane.addBinding(params, 'speed');
	if (extra) pane.addBinding(params, 'extra');
	const applied = vi.fn();
	const drift = createDriftpane(pane, {
		storageNamespace: 'real-preset-regressions',
		urlSync: false,
		draggable: false,
		showDeletePreset: true,
		onStateApplied: applied,
		...options,
	});
	sessions.push({pane, drift});
	const folder = pane.children[pane.children.length - 1] as any;
	const selector = folder.children[options.showThemeControl ? 1 : 0];
	const click = (title: string) => {
		const button = folder.children.find(
			(child: {title?: string}) => child.title === title,
		);
		button.element.querySelector('button').click();
	};
	return {pane, params, drift, applied, folder, selector, click};
}

describe('real Tweakpane: preset regressions', () => {
	beforeEach(() => {
		localStorage.clear();
		vi.useFakeTimers();
		vi.spyOn(window, 'confirm').mockReturnValue(true);
	});
	afterEach(() => {
		for (const {pane, drift} of sessions.splice(0)) {
			drift.dispose();
			pane.dispose();
		}
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('applies the successor after deleting the active preset and emits one hook', () => {
		const {pane, params, drift, applied, selector, click} = session();
		params.speed = 8;
		pane.refresh();
		drift.savePresetAs('Eight');
		applied.mockClear();
		click('Delete preset');
		expect(drift.presets.activeName()).toBe('Default');
		expect(selector.value).toBe(drift.presets.activeId());
		expect(params.speed).toBe(1);
		expect(drift.presets.isModified()).toBe(false);
		expect(applied.mock.calls).toEqual([['preset']]);
	});

	it('does not report an apply when the deletion successor is incompatible', () => {
		const {pane, params, drift, applied, click} = session();
		pane.addBinding(params, 'extra');
		drift.savePresetAs('Expanded');
		applied.mockClear();
		click('Delete preset');
		expect(applied).not.toHaveBeenCalled();
	});

	it('refreshes the factory baseline on later sessions without changing its identity', () => {
		const first = session();
		const id = first.drift.presets.activeId();
		if (!id) throw new Error('Missing default');
		first.drift.dispose();
		first.pane.dispose();
		sessions.splice(0);
		const second = session(5, true);
		expect(second.drift.presets.activeId()).toBe(id);
		second.params.speed = 9;
		second.pane.refresh();
		expect(second.drift.presets.apply(id)).toBe(true);
		expect(second.params.speed).toBe(5);
		expect(second.drift.presets.get(id)?.state.children).toHaveLength(2);
		// Repeated calls in this session must not recapture user edits.
		second.params.speed = 7;
		second.pane.refresh();
		expect(second.drift.presets.ensureDefault()).toBe(false);
		expect(second.drift.presets.revert()).toBe(true);
		expect(second.params.speed).toBe(5);
	});

	it('rolls back an incompatible selection so actions address the visible preset', () => {
		const {drift, selector, click, applied} = session();
		const bad = drift.presets.importJSON(
			JSON.stringify({name: 'Incompatible', state: {children: []}}),
		).ids[0];
		drift.savePresetAs('Good');
		const good = drift.presets.activeId();
		applied.mockClear();
		selector.value = bad;
		expect(selector.value).toBe(good);
		expect(drift.presets.activeId()).toBe(good);
		expect(applied).not.toHaveBeenCalled();
		click('Delete preset');
		expect(window.confirm).toHaveBeenCalledWith(
			'Delete preset "Good"? This action is permanent.',
		);
		expect(drift.presets.get(bad)).toBeDefined();
	});

	it('accepts a complete raw pane export as well as an already scoped state', () => {
		const {pane, params, drift} = session();
		params.speed = 8;
		pane.refresh();
		const raw = JSON.stringify(pane.exportState());
		const scoped = JSON.stringify(drift.presets.currentSnapshot());
		for (const json of [raw, scoped]) {
			params.speed = 3;
			pane.refresh();
			const result = drift.presets.importJSON(json);
			expect(result.imported).toBe(1);
			expect(drift.presets.apply(result.ids[0])).toBe(true);
			expect(params.speed).toBe(8);
			expect(drift.presets.isModified()).toBe(false);
		}
	});

	it('protects Default through all public destructive entry points', () => {
		const {pane, params, drift} = session();
		const id = drift.presets.activeId();
		if (!id) throw new Error('Missing default');
		params.speed = 8;
		pane.refresh();
		expect(drift.presets.overwriteActive()).toBe(false);
		expect(() => drift.presets.overwrite(id)).toThrow('cannot be overwritten');
		drift.presets.acceptSharedOverwrite(id);
		drift.presets.remove(id);
		expect(drift.presets.get(id)).toBeDefined();
		expect(drift.presets.revert()).toBe(true);
		expect(params.speed).toBe(1);
	});

	it('updates the menu for direct controller mutations without discarding live edits', () => {
		const {pane, params, drift, selector, applied} = session();
		const custom = drift.presets.save('Direct');
		expect(selector.value).toBe(custom.id);
		params.speed = 8;
		pane.refresh();
		applied.mockClear();
		drift.presets.rename(custom.id, 'Renamed');
		expect(selector.options).toContainEqual({
			text: '• Renamed',
			value: custom.id,
		});
		expect(params.speed).toBe(8);
		expect(applied).not.toHaveBeenCalled();
	});

	it('creates and renames through the real menu when native prompts are unavailable', () => {
		vi.spyOn(window, 'prompt').mockImplementation(() => {
			throw new Error('Browser prompt blocked');
		});
		const {drift, selector, click} = session();
		const submit = (name: string) => {
			const editor = document.querySelector('.dp-name-editor') as HTMLElement;
			expect(editor).not.toBeNull();
			(editor.querySelector('input') as HTMLInputElement).value = name;
			(editor.querySelector('button') as HTMLButtonElement).click();
		};
		click('Save as new');
		submit('First');
		const id = drift.presets.activeId();
		expect(drift.presets.activeName()).toBe('First');
		expect(selector.value).toBe(id);
		click('Rename preset');
		submit('Second');
		expect(drift.presets.activeName()).toBe('Second');
		expect(selector.options).toContainEqual({text: '• Second', value: id});
		expect(
			JSON.parse(
				localStorage.getItem('driftpane:real-preset-regressions:presets') ??
					'{}',
			).presets,
		).toEqual(
			expect.arrayContaining([expect.objectContaining({id, name: 'Second'})]),
		);
	});

	it('does not submit an enclosing application form from pane buttons or the name editor', () => {
		const host = document.createElement('form');
		document.body.append(host);
		const submits: Event[] = [];
		host.addEventListener('submit', (event) => {
			submits.push(event);
			event.preventDefault();
		});
		const pane = new Pane({container: host, title: 'Form Pane'});
		pane.addBinding({speed: 1}, 'speed');
		const drift = createDriftpane(pane, {
			storageNamespace: 'form-host',
			urlSync: false,
			draggable: false,
		});
		sessions.push({pane, drift});
		const menuButton = Array.from(
			pane.element.querySelectorAll<HTMLButtonElement>('button'),
		).find((button) => button.textContent?.includes('Save as new'));
		expect(menuButton).toBeDefined();
		menuButton?.click();
		expect(submits).toHaveLength(0);
		const editor = pane.element.querySelector('.dp-name-editor') as HTMLElement;
		expect(editor).not.toBeNull();
		(editor.querySelector('input') as HTMLInputElement).value = 'Inside form';
		(editor.querySelector('button') as HTMLButtonElement).click();
		expect(drift.presets.activeName()).toBe('Inside form');
		expect(submits).toHaveLength(0);
		const expanded = pane.exportState()['expanded'];
		(pane.element.querySelector('.tp-rotv_b') as HTMLButtonElement).click();
		expect(pane.exportState()['expanded']).toBe(!expanded);
		expect(submits).toHaveLength(0);
	});

	it('keeps the factory preset protected from renaming', () => {
		const {drift, folder} = session();
		const id = drift.presets.activeId();
		if (!id) throw new Error('Missing default');
		const rename = folder.children.find(
			(child: {title?: string}) => child.title === 'Rename preset',
		);
		expect(rename.disabled).toBe(true);
		drift.presets.rename(id, 'Changed');
		expect(drift.presets.activeName()).toBe('Default');
	});

	it('closes a pending rename when the selected preset changes', () => {
		const {drift, pane, selector, click} = session();
		const first = drift.presets.save('First');
		const second = drift.presets.save('Second');
		selector.value = first.id;
		click('Rename preset');
		expect(pane.element.querySelector('.dp-name-editor')).not.toBeNull();
		selector.value = second.id;
		expect(pane.element.querySelector('.dp-name-editor')).toBeNull();
		expect(drift.presets.activeId()).toBe(second.id);
		expect(drift.presets.get(first.id)?.name).toBe('First');
	});

	it('scopes the actual manager after controls are appended after initialization', () => {
		const {pane, params, drift, folder} = session();
		pane.addBinding(params, 'extra');
		const saved = drift.presets.save('Dynamic');
		const children = saved.state.children as {
			binding?: {key: string};
			title?: string;
		}[];
		expect(children.map((child) => child.binding?.key)).toEqual([
			'speed',
			'extra',
		]);
		expect(children.some((child) => child.title === folder.title)).toBe(false);
		params.extra = 20;
		pane.refresh();
		expect(drift.presets.apply(saved.id)).toBe(true);
		expect(params.extra).toBe(10);
	});

	it('synchronizes the theme selector after programmatic theme changes', () => {
		const {drift, folder} = session(1, false, {showThemeControl: true});
		const themeSelector = folder.children[0];
		const setter = vi.spyOn(drift.theme, 'set');
		drift.theme.set('light');
		expect(themeSelector.value).toBe('light');
		expect(setter).toHaveBeenCalledTimes(1);
	});

	it('unsubscribes preset observers and isolates observers that throw', () => {
		const {drift} = session();
		const observer = vi.fn();
		const unsubscribe = drift.presets.subscribe(observer);
		drift.presets.subscribe(() => {
			throw new Error('consumer');
		});
		expect(() => drift.presets.save('One')).not.toThrow();
		expect(observer).toHaveBeenCalledTimes(1);
		unsubscribe();
		drift.presets.save('Two');
		expect(observer).toHaveBeenCalledTimes(1);
	});

	it('restores backup customs while retaining the current factory baseline', () => {
		const {drift} = session();
		const localDefault = drift.presets.list().find((p) => p.custom === false);
		if (!localDefault) throw new Error('Missing default');
		const state = localDefault.state;
		drift.presets.save('To replace');
		drift.presets.replaceStore({
			version: 1,
			activeId: 'old-default',
			presets: [
				{
					id: 'old-default',
					name: 'Old baseline',
					custom: false,
					state: {children: []},
				},
				{id: 'custom-backup-id', name: 'Backup', custom: true, state},
			],
		});
		expect(drift.presets.activeId()).toBe(localDefault.id);
		expect(drift.presets.get(localDefault.id)?.state).toEqual(state);
		expect(drift.presets.list().map((p) => p.name)).toEqual([
			'Default',
			'Backup',
		]);
		expect(drift.presets.get('custom-backup-id')).toBeDefined();
		const before = drift.presets.exportJSON();
		expect(() => drift.presets.replaceStore({presets: [null]})).toThrow();
		expect(drift.presets.exportJSON()).toBe(before);
	});
});
