import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane, Driftpane} from '../src/driftpane.js';
import {SerializedState} from '../src/types.js';
import {FakePane} from './helpers/fake-pane.js';

function liveState(): SerializedState {
	return {
		expanded: true,
		children: [{binding: {key: 'speed', value: 0.5}}],
	};
}

describe('Driftpane facade', () => {
	let pane: FakePane;

	beforeEach(() => {
		localStorage.clear();
		document.head.innerHTML = '';
		document.body.innerHTML = '';
		pane = new FakePane({initialState: liveState()});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('createDriftpane returns a Driftpane instance', () => {
		const drift = createDriftpane(pane);
		expect(drift).toBeInstanceOf(Driftpane);
		drift.dispose();
	});

	it('injects the layer stylesheet exactly once', () => {
		const a = createDriftpane(pane, {storageNamespace: 'a'});
		const b = createDriftpane(new FakePane({initialState: liveState()}), {
			storageNamespace: 'b',
		});
		expect(document.querySelectorAll('style[data-driftpane]')).toHaveLength(1);
		a.dispose();
		b.dispose();
	});

	it('mounts the preset folder as the LAST child (auto-injected at the bottom)', () => {
		const drift = createDriftpane(pane, {presetFolderTitle: 'My Presets'});
		expect(pane.children).toHaveLength(1);
		expect(pane.children[0].title).toBe('My Presets');
		// In exportState the preset folder is the LAST child (after user bindings).
		const children = pane.exportState().children as Array<{title?: string}>;
		expect(children).toHaveLength(2); // [binding 'speed', folder 'My Presets']
		expect(children[children.length - 1].title).toBe('My Presets');
		drift.dispose();
	});

	it('does NOT mount a preset folder when presetsEnabled is false', () => {
		const drift = createDriftpane(pane, {presetsEnabled: false});
		expect(pane.children).toHaveLength(0);
		drift.dispose();
	});

	it('enables dragging by default (wraps element in a fixed container)', () => {
		const drift = createDriftpane(pane);
		expect(document.querySelector('.driftpane-drag-container')).not.toBeNull();
		drift.dispose();
	});

	it('does not wrap the element when draggable is false', () => {
		const drift = createDriftpane(pane, {draggable: false});
		expect(document.querySelector('.driftpane-drag-container')).toBeNull();
		drift.dispose();
	});

	it('exposes presets and draggable controllers', () => {
		const drift = createDriftpane(pane);
		expect(drift.presets).toBeDefined();
		expect(drift.draggable).toBeDefined();
		expect(drift.pane).toBe(pane);
		drift.dispose();
	});

	it('auto-creates a non-deletable "Default" preset (baseline)', () => {
		const drift = createDriftpane(pane);
		const list = drift.presets.list();
		expect(list).toHaveLength(1);
		expect(list[0].name).toBe('Default');
		expect(list[0].custom).toBe(false); // non-deletable/non-overwritable
		expect(drift.presets.isActiveDeletable()).toBe(false);
		drift.dispose();
	});

	it('savePresetAs creates a custom preset alongside Default', () => {
		const drift = createDriftpane(pane);
		drift.savePresetAs('Saved');
		const list = drift.presets.list();
		expect(list).toHaveLength(2); // Default + Saved
		const saved = list.find((p) => p.name === 'Saved');
		expect(saved?.custom).toBe(true);
		drift.dispose();
	});

	it('restores persisted state on construction when structure matches', () => {
		// Pre-seed a scoped snapshot matching the (post-mount) structure.
		// After the preset folder mounts at the END, the scoped structure (preset
		// folder stripped) is just the single binding child, so persist that shape.
		localStorage.setItem(
			'driftpane:restore:state',
			JSON.stringify({
				expanded: true,
				children: [{binding: {key: 'speed', value: 0.99}}],
			}),
		);
		const refreshSpy = vi.spyOn(pane, 'refresh');
		const drift = createDriftpane(pane, {storageNamespace: 'restore'});
		// restore() succeeded => importState was called and refresh() invoked.
		expect(pane.importedWith).not.toBeNull();
		expect(refreshSpy).toHaveBeenCalled();
		drift.dispose();
	});

	it('resetState clears the persisted pane state', () => {
		const drift = createDriftpane(pane, {storageNamespace: 'reset'});
		// Force a save then reset.
		drift.savePresetAs('x');
		localStorage.setItem('driftpane:reset:state', JSON.stringify({a: 1}));
		drift.resetState();
		expect(localStorage.getItem('driftpane:reset:state')).toBeNull();
		drift.dispose();
	});

	it('dispose tears down without throwing and removes the file input', () => {
		const drift = createDriftpane(pane);
		expect(document.querySelector('input[type="file"]')).not.toBeNull();
		expect(() => drift.dispose()).not.toThrow();
		expect(document.querySelector('input[type="file"]')).toBeNull();
	});

	it('applyPreset applies a saved preset and refreshes', () => {
		const drift = createDriftpane(pane);
		const p = drift.presets.save('P');
		const refreshSpy = vi.spyOn(pane, 'refresh');
		drift.applyPreset(p.id);
		expect(refreshSpy).toHaveBeenCalled();
		drift.dispose();
	});
});
