import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PaneLike, PresetController} from '../src/presets.js';
import {DriftpaneStorage} from '../src/storage.js';
import {SerializedState} from '../src/types.js';

/** Minimal pane stub: stores state, importState matches structure positionally. */
class PaneStub implements PaneLike {
	public state: SerializedState;
	public importAccepts = true;
	public lastImport: SerializedState | null = null;

	constructor(state: SerializedState) {
		this.state = state;
	}
	exportState(): SerializedState {
		return JSON.parse(JSON.stringify(this.state)) as SerializedState;
	}
	importState(state: SerializedState): boolean {
		this.lastImport = state;
		if (!this.importAccepts) {
			return false;
		}
		this.state = JSON.parse(JSON.stringify(state)) as SerializedState;
		return true;
	}
}

/** State with a manager folder at index 0 plus two real children. */
function liveState(): SerializedState {
	return {
		expanded: true,
		children: [
			{title: 'Preset', expanded: true, children: []},
			{binding: {key: 'speed', value: 0.5}},
			{binding: {key: 'color', value: '#fff'}},
		],
	};
}

describe('PresetController', () => {
	let pane: PaneStub;
	let storage: DriftpaneStorage;
	let presets: PresetController;

	beforeEach(() => {
		localStorage.clear();
		pane = new PaneStub(liveState());
		storage = new DriftpaneStorage('presets-test');
		presets = new PresetController(pane, storage, {managerChildIndex: 0});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('save / snapshot scoping', () => {
		it('saves a preset whose state EXCLUDES the manager child (index 0)', () => {
			const p = presets.save('First');
			expect(p.name).toBe('First');
			expect(presets.list()).toHaveLength(1);
			// Scoped snapshot drops child 0 => only the two bindings remain.
			const children = p.state['children'] as Array<Record<string, unknown>>;
			expect(children).toHaveLength(2);
			expect(children[0]).toHaveProperty('binding');
		});

		it('sets the saved preset as active', () => {
			const p = presets.save('Active');
			expect(presets.activeId()).toBe(p.id);
		});

		it('blank names fall back to a placeholder', () => {
			const p = presets.save('   ');
			expect(p.name).toBe('Untitled');
		});

		it('persists across controller instances (localStorage)', () => {
			presets.save('Persisted');
			const reload = new PresetController(pane, storage, {
				managerChildIndex: 0,
			});
			expect(reload.list()).toHaveLength(1);
			expect(reload.list()[0].name).toBe('Persisted');
		});
	});

	describe('overwrite', () => {
		it('updates state and updatedAt, throws for unknown id', () => {
			const p = presets.save('X');
			const before = p.updatedAt;
			// Mutate live state, then overwrite.
			pane.state = liveState();
			(pane.state['children'] as Array<Record<string, unknown>>)[1] = {
				binding: {key: 'speed', value: 9},
			};
			vi.spyOn(Date, 'now').mockReturnValue(before + 1000);
			const updated = presets.overwrite(p.id);
			expect(updated.updatedAt).toBe(before + 1000);
			expect(() => presets.overwrite('missing')).toThrow();
		});
	});

	describe('remove', () => {
		it('removes a preset and reassigns active to the first remaining', () => {
			const a = presets.save('A');
			const b = presets.save('B');
			expect(presets.activeId()).toBe(b.id);
			presets.remove(b.id);
			expect(presets.list()).toHaveLength(1);
			expect(presets.activeId()).toBe(a.id);
		});
		it('sets active to null when the last preset is removed', () => {
			const a = presets.save('Only');
			presets.remove(a.id);
			expect(presets.activeId()).toBeNull();
		});
		it('is a no-op for an unknown id', () => {
			presets.save('A');
			presets.remove('nope');
			expect(presets.list()).toHaveLength(1);
		});
	});

	describe('rename', () => {
		it('renames an existing preset', () => {
			const p = presets.save('Old');
			presets.rename(p.id, 'New');
			expect(presets.get(p.id)?.name).toBe('New');
		});
		it('keeps the old name when the new one is blank', () => {
			const p = presets.save('Keep');
			presets.rename(p.id, '   ');
			expect(presets.get(p.id)?.name).toBe('Keep');
		});
		it('is a no-op for an unknown id', () => {
			expect(() => presets.rename('nope', 'X')).not.toThrow();
		});
	});

	describe('apply (structure guard)', () => {
		it('applies a preset whose structure matches the live pane', () => {
			const p = presets.save('Match');
			// Change a value but keep structure.
			pane.state = liveState();
			const ok = presets.apply(p.id);
			expect(ok).toBe(true);
			expect(presets.activeId()).toBe(p.id);
			// The applied (imported) state re-includes the manager child at 0.
			const imported = pane.lastImport as SerializedState;
			expect((imported['children'] as unknown[]).length).toBe(3);
		});

		it('REJECTS a preset whose structure differs (positional-import guard)', () => {
			const p = presets.save('Mismatch');
			// Remove a binding from the live pane => structure differs.
			pane.state = {
				expanded: true,
				children: [
					{title: 'Preset', expanded: true, children: []},
					{binding: {key: 'speed', value: 0.5}},
				],
			};
			pane.lastImport = null;
			const ok = presets.apply(p.id);
			expect(ok).toBe(false);
			expect(pane.lastImport).toBeNull(); // import was never attempted
		});

		it('returns false for an unknown id', () => {
			expect(presets.apply('nope')).toBe(false);
		});

		it('returns false when importState rejects', () => {
			const p = presets.save('Reject');
			pane.importAccepts = false;
			expect(presets.apply(p.id)).toBe(false);
		});
	});

	describe('exportJSON', () => {
		it('produces a versioned envelope with the format tag', () => {
			presets.save('One');
			const json = presets.exportJSON();
			const parsed = JSON.parse(json);
			expect(parsed.format).toBe('driftpane-presets');
			expect(parsed.version).toBe(1);
			expect(Array.isArray(parsed.presets)).toBe(true);
			expect(parsed.presets).toHaveLength(1);
			expect(typeof parsed.exportedAt).toBe('string');
		});

		it('exportPresetJSON returns a single preset and throws for unknown id', () => {
			const p = presets.save('Solo');
			const parsed = JSON.parse(presets.exportPresetJSON(p.id));
			expect(parsed.id).toBe(p.id);
			expect(() => presets.exportPresetJSON('nope')).toThrow();
		});
	});

	describe('importJSON', () => {
		it('imports a collection envelope', () => {
			const envelope = {
				format: 'driftpane-presets',
				version: 1,
				presets: [
					{id: 'a', name: 'Alpha', state: {children: []}},
					{id: 'b', name: 'Beta', state: {children: []}},
				],
			};
			const res = presets.importJSON(JSON.stringify(envelope));
			expect(res.imported).toBe(2);
			expect(presets.list().map((p) => p.name)).toEqual(['Alpha', 'Beta']);
		});

		it('imports a bare single preset { name, state }', () => {
			const res = presets.importJSON(
				JSON.stringify({name: 'Bare', state: {children: []}}),
			);
			expect(res.imported).toBe(1);
			expect(presets.get(res.ids[0])?.name).toBe('Bare');
		});

		it('imports a raw exportState { children: [...] } as a new preset', () => {
			const res = presets.importJSON(
				JSON.stringify({children: [{binding: {key: 'x'}}]}),
			);
			expect(res.imported).toBe(1);
			expect(presets.get(res.ids[0])?.name).toBe('Imported');
		});

		it('throws a catchable Error for malformed JSON', () => {
			expect(() => presets.importJSON('{not valid')).toThrowError();
		});

		it('throws for unrecognised JSON shapes', () => {
			expect(() => presets.importJSON(JSON.stringify({foo: 1}))).toThrow();
			expect(() => presets.importJSON(JSON.stringify(42))).toThrow();
		});

		it('regenerates colliding ids on import', () => {
			const existing = presets.save('Existing');
			const res = presets.importJSON(
				JSON.stringify({
					presets: [{id: existing.id, name: 'Clone', state: {children: []}}],
				}),
			);
			expect(res.imported).toBe(1);
			// The imported id must NOT equal the colliding one.
			expect(res.ids[0]).not.toBe(existing.id);
			// Both presets now coexist.
			expect(presets.list()).toHaveLength(2);
			const ids = presets.list().map((p) => p.id);
			expect(new Set(ids).size).toBe(2);
		});
	});

	describe('loadStore validation', () => {
		it('falls back to an empty store when persisted data is malformed', () => {
			localStorage.setItem('driftpane:presets-test:presets', '{"presets": 5}');
			const c = new PresetController(pane, storage, {managerChildIndex: 0});
			expect(c.list()).toHaveLength(0);
			expect(c.activeId()).toBeNull();
		});

		it('filters out preset entries with an invalid shape', () => {
			localStorage.setItem(
				'driftpane:presets-test:presets',
				JSON.stringify({
					version: 1,
					activeId: null,
					presets: [
						{name: 'Good', state: {children: []}},
						{name: 'NoState'},
						{state: {children: []}},
					],
				}),
			);
			const c = new PresetController(pane, storage, {managerChildIndex: 0});
			expect(c.list()).toHaveLength(1);
			expect(c.list()[0].name).toBe('Good');
		});
	});

	describe('ensureDefault / Default preset', () => {
		it('creates a Default preset (custom:false) and makes it active when empty', () => {
			expect(presets.ensureDefault('Default')).toBe(true);
			const list = presets.list();
			expect(list).toHaveLength(1);
			expect(list[0].name).toBe('Default');
			expect(list[0].custom).toBe(false);
			expect(presets.activeId()).toBe(list[0].id);
		});

		it('the Default is NOT deletable nor active-deletable', () => {
			presets.ensureDefault('Default');
			expect(presets.isActiveDeletable()).toBe(false);
			expect(presets.removeActive()).toBe(false);
			expect(presets.list()).toHaveLength(1); // it stays there
		});

		it('does not duplicate the Default when one already exists', () => {
			expect(presets.ensureDefault('Default')).toBe(true);
			expect(presets.ensureDefault('Default')).toBe(false);
			expect(presets.list().filter((p) => p.custom === false)).toHaveLength(1);
		});

		it('places it at the top without changing the active preset if presets already exist', () => {
			const custom = presets.save('Mine'); // custom, becomes active
			expect(presets.ensureDefault('Default')).toBe(true);
			const list = presets.list();
			expect(list[0].name).toBe('Default'); // at the top
			expect(presets.activeId()).toBe(custom.id); // active unchanged
		});

		it('revert() restores the active Default snapshot', () => {
			presets.ensureDefault('Default');
			// the user "modifies" the live state
			pane.state = {
				expanded: true,
				children: [
					{title: 'Preset', expanded: true, children: []},
					{binding: {key: 'speed', value: 0.99}},
					{binding: {key: 'color', value: '#000'}},
				],
			};
			expect(presets.isModified()).toBe(true);
			expect(presets.revert()).toBe(true);
			// after revert the live state returns to the Default values (0.5 / #fff)
			expect(presets.isModified()).toBe(false);
		});
	});

	describe('expanded scoping (global fold state, not per-preset)', () => {
		it('a saved preset stores NO `expanded` field', () => {
			const p = presets.save('Folded');
			expect(JSON.stringify(p.state)).not.toContain('expanded');
		});

		it('applying a preset keeps the CURRENT expanded state, not the preset one', () => {
			const p = presets.save('P');
			// The user changes both values AND the open/closed (top expanded) state.
			pane.state = {
				expanded: false,
				children: [
					{title: 'Preset', expanded: true, children: []},
					{binding: {key: 'speed', value: 9}},
					{binding: {key: 'color', value: '#000'}},
				],
			};
			expect(presets.apply(p.id)).toBe(true);
			const imported = pane.lastImport as SerializedState;
			// expanded comes from LIVE (false); values from the preset (0.5 / #fff).
			expect(imported['expanded']).toBe(false);
			const children = imported['children'] as Array<Record<string, unknown>>;
			expect((children[1]['binding'] as Record<string, unknown>)['value']).toBe(
				0.5,
			);
		});

		it('toggling a folder open/closed does NOT mark the preset modified', () => {
			presets.save('Stable');
			// Same values, only the top-level expanded flips.
			pane.state = {
				expanded: false,
				children: [
					{title: 'Preset', expanded: true, children: []},
					{binding: {key: 'speed', value: 0.5}},
					{binding: {key: 'color', value: '#fff'}},
				],
			};
			expect(presets.isModified()).toBe(false);
		});
	});
});
