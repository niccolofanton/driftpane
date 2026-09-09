import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PersistenceController} from '../src/persistence.js';
import {DriftpaneStorage} from '../src/storage.js';
import {SerializedState} from '../src/types.js';
import {FakeFolder, FakePane} from './helpers/fake-pane.js';

function liveState(): SerializedState {
	return {
		expanded: true,
		children: [
			{title: 'Preset', expanded: true, children: []},
			{binding: {key: 'speed', value: 0.5}},
		],
	};
}

describe('PersistenceController', () => {
	let pane: FakePane;
	let storage: DriftpaneStorage;
	let ctrl: PersistenceController;

	beforeEach(() => {
		localStorage.clear();
		document.body.innerHTML = '';
		vi.useFakeTimers();
		pane = new FakePane({initialState: liveState()});
		storage = new DriftpaneStorage('persist-test');
		ctrl = new PersistenceController(pane, storage, {
			debounceMs: 100,
			managerChildIndex: 0,
		});
	});
	afterEach(() => {
		ctrl.dispose();
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('saveNow writes the SCOPED state (manager child removed)', () => {
		ctrl.saveNow();
		const stored = storage.readJSON<SerializedState>('state', {});
		const children = stored['children'] as Array<Record<string, unknown>>;
		expect(children).toHaveLength(1); // child 0 stripped
		expect(children[0]).toHaveProperty('binding');
	});

	it('a change event schedules a debounced save', () => {
		const spy = vi.spyOn(ctrl, 'saveNow');
		pane.emit('change', {});
		expect(spy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(100);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('a fold event schedules a debounced save', () => {
		const spy = vi.spyOn(ctrl, 'saveNow');
		pane.emit('fold', {});
		vi.advanceTimersByTime(100);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('collapses a burst of changes into a single write', () => {
		const spy = vi.spyOn(ctrl, 'saveNow');
		pane.emit('change', {});
		pane.emit('change', {});
		pane.emit('change', {});
		vi.advanceTimersByTime(100);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it('a DOM click on the pane element schedules a save', () => {
		const spy = vi.spyOn(ctrl, 'saveNow');
		pane.element.dispatchEvent(new Event('click', {bubbles: true}));
		vi.advanceTimersByTime(100);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	describe('restore (structure guard)', () => {
		it('accepts and applies a snapshot with matching structure', () => {
			// Persist a scoped snapshot first.
			ctrl.saveNow();
			const ok = ctrl.restore();
			expect(ok).toBe(true);
			// importState re-includes the manager child (3 ? no: 2 children: manager + binding).
			const imported = pane.importedWith as SerializedState;
			expect((imported['children'] as unknown[]).length).toBe(2);
		});

		it('rejects a snapshot whose structure differs', () => {
			// Store a snapshot with an extra binding (structure mismatch).
			storage.writeJSON('state', {
				expanded: true,
				children: [
					{binding: {key: 'speed', value: 0.5}},
					{binding: {key: 'extra', value: 1}},
				],
			});
			pane.importedWith = null;
			const ok = ctrl.restore();
			expect(ok).toBe(false);
			expect(pane.importedWith).toBeNull();
		});

		it('returns false when there is no stored state', () => {
			expect(ctrl.restore()).toBe(false);
		});
	});

	describe('subpanel listener recursion', () => {
		it('attaches a fold listener on every descendant folder', () => {
			const child = new FakeFolder('Child');
			const grandchild = new FakeFolder('Grandchild');
			child.children.push(grandchild);
			const tree = new FakePane({initialState: liveState()});
			tree.children.push(child);

			const c = new PersistenceController(tree, storage, {
				debounceMs: 100,
				managerChildIndex: 0,
			});
			// Both nested folders should have a 'fold' handler registered.
			expect(child.foldHandlerCount()).toBe(1);
			expect(grandchild.foldHandlerCount()).toBe(1);

			// And firing a nested fold schedules a save.
			const spy = vi.spyOn(c, 'saveNow');
			grandchild.emit('fold', {});
			vi.advanceTimersByTime(100);
			expect(spy).toHaveBeenCalledTimes(1);
			c.dispose();
		});

		it('attaches a select listener on tab-like nodes (pages array)', () => {
			const tab = new FakeFolder('Tab');
			tab.pages = [new FakeFolder('Page1'), new FakeFolder('Page2')];
			const tree = new FakePane({initialState: liveState()});
			tree.children.push(tab);

			const c = new PersistenceController(tree, storage, {
				debounceMs: 100,
				managerChildIndex: 0,
			});
			expect(tab.selectHandlerCount()).toBe(1);
			c.dispose();
		});
	});

	describe('clear / dispose', () => {
		it('clear removes the persisted state key', () => {
			ctrl.saveNow();
			expect(storage.readJSON('state', null)).not.toBeNull();
			ctrl.clear();
			expect(storage.readJSON('state', null)).toBeNull();
		});

		it('after dispose, scheduled saves are no-ops', () => {
			const spy = vi.spyOn(storage, 'writeJSON');
			ctrl.dispose();
			ctrl.scheduleSave();
			vi.advanceTimersByTime(200);
			ctrl.saveNow();
			expect(spy).not.toHaveBeenCalled();
		});

		it('dispose removes the pane click listener', () => {
			const spy = vi.spyOn(ctrl, 'saveNow');
			ctrl.dispose();
			pane.element.dispatchEvent(new Event('click', {bubbles: true}));
			vi.advanceTimersByTime(200);
			expect(spy).not.toHaveBeenCalled();
		});
	});
});
