import {beforeEach, describe, expect, it} from 'vitest';

import {PaneLike, PresetController} from '../src/presets.js';
import {DriftpaneStorage} from '../src/storage.js';
import {DriftpaneShareEnvelope, SerializedState} from '../src/types.js';

/** Minimal pane stub (manager folder at index 0). */
class PaneStub implements PaneLike {
	public state: SerializedState;
	constructor(state: SerializedState) {
		this.state = state;
	}
	exportState(): SerializedState {
		return JSON.parse(JSON.stringify(this.state)) as SerializedState;
	}
	importState(state: SerializedState): boolean {
		this.state = JSON.parse(JSON.stringify(state)) as SerializedState;
		return true;
	}
}

function liveState(speed = 0.5): SerializedState {
	return {
		expanded: true,
		children: [
			{title: 'Preset', expanded: true, children: []},
			{binding: {key: 'speed', value: speed}},
		],
	};
}

function env(partial: Partial<DriftpaneShareEnvelope>): DriftpaneShareEnvelope {
	return {
		f: 'driftpane-share',
		v: 1,
		n: 'Preset',
		d: false,
		s: {},
		...partial,
	};
}

describe('PresetController — URL sharing', () => {
	let pane: PaneStub;
	let presets: PresetController;

	beforeEach(() => {
		localStorage.clear();
		pane = new PaneStub(liveState());
		presets = new PresetController(pane, new DriftpaneStorage('share-test'), {
			managerChildIndex: 0,
		});
		presets.ensureDefault('Default');
	});

	describe('activeIdentity', () => {
		it('carries a name marker for the default preset', () => {
			expect(presets.activeIdentity()).toEqual({
				name: 'Default',
				isDefault: true,
			});
		});

		it('carries the uuid for a custom preset', () => {
			const p = presets.save('Sunset');
			expect(presets.activeIdentity()).toEqual({
				id: p.id,
				name: 'Sunset',
				isDefault: false,
			});
		});
	});

	describe('resolveSharedAction', () => {
		it('overwrites when the uuid is already in the store', () => {
			const p = presets.save('Sunset');
			expect(presets.resolveSharedAction(env({id: p.id, d: false}))).toEqual({
				action: 'overwrite',
				existingName: 'Sunset',
			});
		});

		it('imports when the uuid is unknown', () => {
			expect(presets.resolveSharedAction(env({id: 'nope', d: false}))).toEqual({
				action: 'import',
			});
		});

		it('imports for a name-marker (default) envelope', () => {
			expect(presets.resolveSharedAction(env({d: true, n: 'Default'}))).toEqual(
				{
					action: 'import',
				},
			);
		});
	});

	describe('acceptSharedImport', () => {
		it('creates a "<name> (imported)" preset for a name marker', () => {
			pane.state = liveState(0.9);
			const p = presets.acceptSharedImport(env({d: true, n: 'Studio'}));
			expect(p.name).toBe('Studio (imported)');
			expect(p.custom).toBe(true);
			expect(presets.activeId()).toBe(p.id);
		});

		it('is idempotent by content (activates an identical preset)', () => {
			pane.state = liveState(0.9);
			const first = presets.acceptSharedImport(env({d: true, n: 'Studio'}));
			const before = presets.list().length;
			// same live state -> identical snapshot -> no duplicate
			const second = presets.acceptSharedImport(env({d: true, n: 'Studio'}));
			expect(second.id).toBe(first.id);
			expect(presets.list()).toHaveLength(before);
		});

		it('numbers the name when an imported one already exists with different content', () => {
			pane.state = liveState(0.9);
			presets.acceptSharedImport(env({d: true, n: 'Studio'}));
			pane.state = liveState(0.1); // different content
			const second = presets.acceptSharedImport(env({d: true, n: 'Studio'}));
			expect(second.name).toBe('Studio (imported 2)');
		});

		it('preserves the uuid for a custom import not yet in the store', () => {
			const p = presets.acceptSharedImport(
				env({id: 'uuid-xyz', d: false, n: 'Bar'}),
			);
			expect(p.id).toBe('uuid-xyz');
			expect(presets.get('uuid-xyz')).toBeDefined();
		});
	});

	describe('acceptSharedOverwrite', () => {
		it('overwrites the existing preset with the current (previewed) state', () => {
			const p = presets.save('Sunset'); // snapshots speed 0.5
			pane.state = liveState(0.42); // simulate previewed state
			presets.acceptSharedOverwrite(p.id);
			const updated = presets.get(p.id) as {state: SerializedState};
			const children = updated.state['children'] as Array<{
				binding?: {value: unknown};
			}>;
			expect(children[0].binding?.value).toBe(0.42);
		});

		it('is a no-op for an unknown id', () => {
			const before = presets.list().length;
			presets.acceptSharedOverwrite('nope');
			expect(presets.list()).toHaveLength(before);
		});
	});
});
