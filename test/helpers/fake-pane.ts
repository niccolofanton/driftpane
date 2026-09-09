// Lightweight test doubles for the subset of the Tweakpane public API that the
// Driftpane layer consumes. These are intentionally minimal but behaviourally
// faithful to the parts that matter for the tests:
//  - exportState()/importState() with POSITIONAL children matching;
//  - on('change'|'fold'|'select') event emitters;
//  - addBlade({view:'folder', index}) inserting a child at a position;
//  - addBlade({view:'list'}) returning a list-blade with value/options;
//  - addButton() returning a clickable button;
//  - element (a real jsdom HTMLElement), refresh(), and the structural members
//    (children/pages/expanded) used by the recursive subpanel listeners.

import {SerializedState} from '../../src/types.js';

type Handler = (e: unknown) => void;

/** A simple multi-event emitter shared by the fakes. */
class Emitter {
	private readonly handlers = new Map<string, Handler[]>();

	public on(ev: string, handler: Handler): this {
		const list = this.handlers.get(ev) ?? [];
		list.push(handler);
		this.handlers.set(ev, list);
		return this;
	}

	public emit(ev: string, payload?: unknown): void {
		const list = this.handlers.get(ev);
		if (!list) {
			return;
		}
		for (const h of list.slice()) {
			h(payload);
		}
	}

	public handlerCount(ev: string): number {
		return (this.handlers.get(ev) ?? []).length;
	}
}

/** A fake button blade. */
export class FakeButton {
	public readonly title: string;
	private readonly emitter = new Emitter();
	public disposed = false;
	/** Disabled state (set by the menu via updateButtonStates). */
	public disabled = false;

	constructor(title: string) {
		this.title = title;
	}

	public on(ev: 'click', handler: () => void): this {
		this.emitter.on(ev, handler as Handler);
		return this;
	}

	/** Simulate a user click. */
	public click(): void {
		this.emitter.emit('click');
	}

	public dispose(): void {
		this.disposed = true;
	}
}

/** A fake list blade (the preset selector). */
export class FakeListBlade {
	public value: unknown;
	public options: unknown;
	private readonly emitter = new Emitter();
	public disposed = false;

	constructor(params: {value?: unknown; options?: unknown}) {
		this.value = params.value;
		this.options = params.options;
	}

	public on(ev: 'change', handler: (e: {value: unknown}) => void): this {
		this.emitter.on(ev, handler as Handler);
		return this;
	}

	/** Simulate the user selecting a value from the dropdown. */
	public select(value: unknown): void {
		this.value = value;
		this.emitter.emit('change', {value});
	}

	public dispose(): void {
		this.disposed = true;
	}
}

/**
 * A fake folder/tab-ish container. Exposes `children`, `pages`, `expanded`,
 * `on` so the recursive subpanel listener treats it as a foldable node.
 */
export class FakeFolder {
	public readonly title: string;
	public expanded = true;
	public readonly children: FakeFolder[] = [];
	public pages?: FakeFolder[];
	private readonly emitter = new Emitter();
	private readonly buttons: FakeButton[] = [];
	private readonly listBlades: FakeListBlade[] = [];
	public disposed = false;

	constructor(title: string) {
		this.title = title;
	}

	public on(ev: 'fold' | 'select' | 'change', handler: Handler): this {
		this.emitter.on(ev, handler);
		return this;
	}

	public emit(ev: string, payload?: unknown): void {
		this.emitter.emit(ev, payload);
	}

	public foldHandlerCount(): number {
		return this.emitter.handlerCount('fold');
	}

	public selectHandlerCount(): number {
		return this.emitter.handlerCount('select');
	}

	public addButton(params: {title: string; label?: string}): FakeButton {
		const button = new FakeButton(params.title);
		this.buttons.push(button);
		return button;
	}

	public addBlade(params: Record<string, unknown>): FakeListBlade {
		const blade = new FakeListBlade({
			value: params['value'],
			options: params['options'],
		});
		this.listBlades.push(blade);
		return blade;
	}

	/** Find a button created in this folder by its title. */
	public button(title: string): FakeButton | undefined {
		return this.buttons.find((b) => b.title === title);
	}

	/** The first list blade created in this folder. */
	public list(): FakeListBlade | undefined {
		return this.listBlades[0];
	}

	public dispose(): void {
		this.disposed = true;
	}
}

export interface FakePaneOptions {
	/** Initial exportState() snapshot returned by the pane. */
	initialState?: SerializedState;
	/** Whether importState should accept (true) or reject (false). */
	importAccepts?: boolean;
}

/**
 * A fake Pane. Backs exportState/importState with a stored state object so
 * round-trips are observable, emits change/fold, supports addBlade for the
 * preset folder at a given index, and carries a real jsdom element.
 */
export class FakePane {
	public element: HTMLElement;
	public refreshCount = 0;
	public importedWith: SerializedState | null = null;
	public importAccepts: boolean;

	public state: SerializedState;
	public readonly children: FakeFolder[] = [];

	private readonly emitter = new Emitter();
	public importStateImpl: ((s: SerializedState) => boolean) | null = null;

	constructor(opts: FakePaneOptions = {}) {
		this.state = opts.initialState ?? {children: []};
		this.importAccepts = opts.importAccepts ?? true;
		const doc = typeof document !== 'undefined' ? document : null;
		if (!doc) {
			throw new Error('FakePane requires a DOM (jsdom) environment');
		}
		this.element = doc.createElement('div');
		// Mirror the real pane's drag-handle element so DraggableController can
		// find it via DRAG_HANDLE_SELECTOR ('.tp-rotv_b').
		const handle = doc.createElement('div');
		handle.className = 'tp-rotv_b';
		this.element.appendChild(handle);
		doc.body.appendChild(this.element);
	}

	public exportState(): SerializedState {
		// Return a deep-ish clone so callers cannot mutate our backing store.
		return JSON.parse(JSON.stringify(this.state)) as SerializedState;
	}

	public importState(state: SerializedState): boolean {
		this.importedWith = state;
		if (this.importStateImpl) {
			return this.importStateImpl(state);
		}
		if (this.importAccepts) {
			this.state = JSON.parse(JSON.stringify(state)) as SerializedState;
			return true;
		}
		return false;
	}

	public on(ev: 'change' | 'fold', handler: (e: unknown) => void): this {
		this.emitter.on(ev, handler as Handler);
		return this;
	}

	public emit(ev: string, payload?: unknown): void {
		this.emitter.emit(ev, payload);
	}

	public addButton(params: {title: string; label?: string}): FakeButton {
		return new FakeButton(params.title);
	}

	public addBlade(params: Record<string, unknown>): FakeFolder | FakeListBlade {
		if (params['view'] === 'folder') {
			const folder = new FakeFolder(String(params['title'] ?? ''));
			const hasIndex = typeof params['index'] === 'number';
			// FakeFolder array: explicit index, or append at the end.
			const childIndex = hasIndex
				? (params['index'] as number)
				: this.children.length;
			this.children.splice(childIndex, 0, folder);
			// exportState children: without `index` the real core APPENDS the folder
			// as the LAST child of the rack; we mirror that behavior using the length
			// of the state array (which includes the non-folder bindings), not the
			// FakeFolder array length. This way stripManagerChild has the real last
			// child to exclude.
			if (Array.isArray(this.state['children'])) {
				const stateChildren = this.state['children'] as unknown[];
				const stateIndex = hasIndex
					? (params['index'] as number)
					: stateChildren.length;
				stateChildren.splice(stateIndex, 0, {
					title: folder.title,
					expanded: true,
					children: [],
				});
			}
			return folder;
		}
		return new FakeListBlade({
			value: params['value'],
			options: params['options'],
		});
	}

	public refresh(): void {
		this.refreshCount += 1;
	}
}
