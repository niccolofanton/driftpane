import {Pane} from 'tweakpane';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane, Driftpane} from '../src/index.js';

const sessions: {pane: Pane; drift: Driftpane}[] = [];
function session(namespace: string) {
	const params = {a: 1, b: 2};
	const pane = new Pane({title: 'Adversarial presets'});
	pane.addBinding(params, 'a');
	pane.addBinding(params, 'b');
	const drift = createDriftpane(pane, {
		storageNamespace: namespace,
		urlSync: false,
	});
	sessions.push({pane, drift});
	return {pane, drift, params};
}

beforeEach(() => {
	localStorage.clear();
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

describe('adversarial preset and backup review', () => {
	it('failed preset application must not partially change earlier bindings', () => {
		const {drift, params} = session('partial');
		const baseline = drift.presets.activeId();
		const state = drift.presets.currentSnapshot() as any;
		state.children[0].binding.value = 99;
		const {ids} = drift.presets.importJSON(
			JSON.stringify({name: 'Broken', state}),
		);
		// The public get() API exposes preset objects; even damaged in-memory
		// data must not leave a partially applied configuration.
		(drift.presets.get(ids[0]) as any).state.children[1].disabled =
			'invalid boolean';
		expect(drift.presets.apply(ids[0])).toBe(false);
		expect(drift.presets.activeId()).toBe(baseline);
		expect(params).toEqual({a: 1, b: 2});
	});

	it('importing a Default file creates a user-owned, removable preset', () => {
		const source = session('default-source');
		const raw = source.drift.presets.exportPresetJSON(
			source.drift.presets.activeId() as string,
		);
		const target = session('default-target');
		const {ids} = target.drift.presets.importJSON(raw);
		expect(target.drift.presets.apply(ids[0])).toBe(true);
		target.drift.presets.removeActive();
		expect(target.drift.presets.get(ids[0])).toBeUndefined();
	});

	it('a backup containing an invalid preset state must not replace a valid collection', () => {
		const {drift} = session('invalid-backup-state');
		drift.savePresetAs('Keep');
		const before = drift.presets.exportJSON();
		const backup = JSON.parse(drift.exportAllJSON());
		backup.data.presets = {
			version: 1,
			activeId: 'invalid',
			presets: [{id: 'invalid', name: 'Invalid', state: []}],
		};
		expect(() => drift.importAllJSON(JSON.stringify(backup))).toThrow();
		expect(drift.presets.exportJSON()).toBe(before);
	});

	it('does not finish a selected file import after the driftpane was disposed', () => {
		const {pane, drift, params} = session('late-file');
		const state = drift.presets.currentSnapshot() as any;
		state.children[0].binding.value = 99;
		const raw = JSON.stringify({name: 'Late', state});
		let complete: (() => void) | undefined;
		const aborted = vi.fn();
		vi.stubGlobal(
			'FileReader',
			class {
				public result = raw;
				public readyState = 1;
				public abort = aborted;
				public onload: (() => void) | null = null;
				public readAsText(): void {
					const queued = this.onload;
					complete = () => queued?.();
				}
			},
		);
		const input = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement;
		Object.defineProperty(input, 'files', {
			value: [new File([raw], 'late.json')],
		});
		input.dispatchEvent(new Event('change'));
		drift.dispose();
		const before = localStorage.getItem('driftpane:late-file:presets');
		complete?.();
		expect(aborted).toHaveBeenCalledOnce();
		expect(pane.children).toHaveLength(2);
		expect(params.a).toBe(1);
		expect(localStorage.getItem('driftpane:late-file:presets')).toBe(before);
	});

	it('rejects a collection envelope from an unsupported future version', () => {
		const {drift} = session('future-version');
		const envelope = JSON.parse(drift.presets.exportJSON());
		envelope.version = 999;
		expect(() => drift.presets.importJSON(JSON.stringify(envelope))).toThrow();
	});
	it('rejects nested malformed state and unsupported backup store versions before replacing presets', () => {
		const {drift} = session('nested-invalid');
		drift.savePresetAs('Keep');
		const before = drift.presets.exportJSON();
		const backup = JSON.parse(drift.exportAllJSON());
		const invalidStates = [
			{},
			{title: 'No state content'},
			{children: [null]},
			{children: {}},
			{children: [{disabled: 'bad'}]},
			{children: [{binding: []}]},
		];
		for (const state of invalidStates) {
			backup.data.presets = {version: 1, presets: [{name: 'Invalid', state}]};
			expect(() => drift.importAllJSON(JSON.stringify(backup))).toThrow();
			expect(drift.presets.exportJSON()).toBe(before);
		}
		backup.data.presets = {version: 999, presets: []};
		expect(() => drift.importAllJSON(JSON.stringify(backup))).toThrow();
		expect(drift.presets.exportJSON()).toBe(before);
	});

	it('retains imported Default files through a subsequent full backup roundtrip', () => {
		const source = session('roundtrip-source');
		const raw = JSON.parse(
			source.drift.presets.exportPresetJSON(
				source.drift.presets.activeId() as string,
			),
		);
		raw.name = 'Imported factory';
		const {ids} = source.drift.presets.importJSON(JSON.stringify(raw));
		const target = session('roundtrip-target');
		target.drift.importAllJSON(source.drift.exportAllJSON());
		expect(target.drift.presets.get(ids[0])?.name).toBe('Imported factory');
		expect(target.drift.presets.get(ids[0])?.custom).toBe(true);
	});

	it('preserves old duplicate protected Defaults as user-owned presets during backup restore', () => {
		const source = session('legacy-protected');
		const backup = JSON.parse(source.drift.exportAllJSON());
		const extra = {
			...backup.data.presets.presets[0],
			id: 'legacy-import',
			name: 'Older imported default',
		};
		backup.data.presets.presets.push(extra);
		backup.data.presets.activeId = extra.id;
		const target = session('legacy-receiver');
		target.drift.importAllJSON(JSON.stringify(backup));
		expect(target.drift.presets.get(extra.id)?.custom).toBe(true);
		expect(target.drift.presets.activeId()).toBe(extra.id);
	});

	it('regenerates IDs that would collide with the menu empty-selection marker', () => {
		const {drift} = session('reserved-id');
		for (const id of ['', '__none__']) {
			const result = drift.presets.importJSON(
				JSON.stringify({
					id,
					name: 'Imported',
					state: drift.presets.currentSnapshot(),
				}),
			);
			expect(result.ids[0]).not.toBe(id);
			expect(drift.presets.apply(result.ids[0])).toBe(true);
			expect(drift.presets.isActiveDeletable()).toBe(true);
		}
	});
	it('refuses a future persisted store without overwriting it or leaking the theme listener', () => {
		const key = 'driftpane:future-persisted:presets';
		const stored = JSON.stringify({
			version: 999,
			activeId: 'future',
			presets: [{id: 'future', name: 'Future', state: {newFormat: true}}],
		});
		localStorage.setItem(key, stored);
		const added = vi.fn();
		const removed = vi.fn();
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => ({
				matches: false,
				addEventListener: added,
				removeEventListener: removed,
			})),
		);
		const pane = new Pane({title: 'Future version'});
		try {
			expect(() =>
				createDriftpane(pane, {
					storageNamespace: 'future-persisted',
					urlSync: false,
					theme: 'auto',
				}),
			).toThrow('Unsupported preset store version');
			expect(localStorage.getItem(key)).toBe(stored);
			expect(added).toHaveBeenCalledOnce();
			expect(removed).toHaveBeenCalledWith('change', added.mock.calls[0][1]);
		} finally {
			pane.dispose();
		}
	});

	it('continues to load legacy preset stores with no version field', () => {
		const first = session('legacy-no-version');
		first.drift.savePresetAs('Legacy saved');
		const key = 'driftpane:legacy-no-version:presets';
		const legacy = JSON.parse(localStorage.getItem(key) as string);
		delete legacy.version;
		localStorage.setItem(key, JSON.stringify(legacy));
		const second = session('legacy-no-version');
		expect(second.drift.presets.activeName()).toBe('Legacy saved');
		expect(second.drift.presets.list()).toHaveLength(2);
	});
});
