// Feature 1 + 3: pane state persistence.
//
// Single source of truth: `pane.exportState()`. The `expanded` state of the pane
// (feature 1) and of the folders (feature 3), plus all binding values, are
// already all inside exportState, so a single mechanism covers both features.
// We save SCOPED (without the preset folder, see state-scope) with a debounce
// on `change` + `fold`, and restore with `importState` on load.

import {debounce, Debounced} from './debounce.js';
import {
	mergeManagerChild,
	stripManagerChild,
	structureSignature,
} from './state-scope.js';
import {DriftpaneStorage} from './storage.js';
import {SerializedState} from './types.js';

/** localStorage key suffix for the pane state. */
const STATE_KEY = 'state';

/**
 * Minimal superset of the Pane API used by persistence.
 * We depend only on public Tweakpane symbols.
 */
export interface PaneLike {
	exportState(): SerializedState;
	importState(state: SerializedState): boolean;
	on(ev: 'change' | 'fold', handler: (e: unknown) => void): unknown;
	element: HTMLElement;
}

/** Internal options of the persistence controller. */
export interface PersistenceOptions {
	debounceMs: number;
	/**
	 * Index of the preset folder to exclude from the snapshot. The preset folder is
	 * the LAST child, so it is typically a resolver `() => last index`
	 * (see driftpane.ts); it also accepts a fixed number (used by the tests).
	 */
	managerChildIndex: number | (() => number);
}

export class PersistenceController {
	private readonly pane: PaneLike;
	private readonly storage: DriftpaneStorage;
	private readonly managerChildIndex: number | (() => number);
	private readonly debouncedSave: Debounced<() => void>;
	private disposed = false;

	// Handler references for teardown (pagehide/visibilitychange).
	private readonly onPageHide: () => void;
	private readonly onVisibilityChange: () => void;
	private readonly onChange: (e: unknown) => void;
	private readonly onFold: (e: unknown) => void;
	private readonly onPaneClick: () => void;

	constructor(
		pane: PaneLike,
		storage: DriftpaneStorage,
		opts: PersistenceOptions,
	) {
		this.pane = pane;
		this.storage = storage;
		this.managerChildIndex = opts.managerChildIndex;

		this.debouncedSave = debounce(() => this.saveNow(), opts.debounceMs);

		// Single rule: every change/fold schedules a debounced save.
		// We do not filter by ev.last: the trailing-edge debounce already collapses
		// the entire burst into a single write by reading exportState at flush.
		this.onChange = (): void => this.scheduleSave();
		this.onFold = (): void => this.scheduleSave();
		this.pane.on('change', this.onChange);
		this.pane.on('fold', this.onFold);

		// IMPORTANT: the root RackApi emits ONLY 'change'; the root 'fold' event
		// covers only the whole pane. The fold events of NESTED folders (at any
		// depth) and tab page changes do NOT bubble up to the root, so without this
		// step the open/closed state of the sub-panels would never be saved. We
		// therefore register a listener on EVERY descendant folder/tab.
		this.attachSubpanelListeners(this.pane);

		// DOM-level safety net: a fold/page-change is always a click on the
		// title-bar inside the pane element. A single delegated listener schedules
		// a save on every click (debounced), so the sub-panel state is captured
		// robustly, regardless of the propagation of the API events.
		this.onPaneClick = (): void => this.scheduleSave();
		this.pane.element.addEventListener('click', this.onPaneClick);

		// Flush pending saves when the page is about to be hidden or unloaded, so
		// we do not lose the last change.
		this.onPageHide = (): void => this.debouncedSave.flush();
		this.onVisibilityChange = (): void => {
			if (
				typeof document !== 'undefined' &&
				document.visibilityState === 'hidden'
			) {
				this.debouncedSave.flush();
			}
		};
		if (typeof window !== 'undefined') {
			window.addEventListener('pagehide', this.onPageHide);
		}
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.onVisibilityChange);
		}
	}

	/**
	 * Registers a save listener on EVERY descendant sub-panel:
	 * `fold` for folders (at any depth) and `select` for tabs. Uses only public
	 * members (`children`, `pages`, `expanded`, `on`) via duck-typing, to avoid
	 * depending on internal core imports.
	 */
	private attachSubpanelListeners(root: unknown): void {
		const visit = (node: unknown): void => {
			if (!node || typeof node !== 'object') {
				return;
			}
			const n = node as {
				on?: (ev: string, h: (e: unknown) => void) => unknown;
				children?: unknown[];
				pages?: unknown[];
			};
			// Folder: exposes 'expanded' in addition to 'on' -> persist its folds.
			if (typeof n.on === 'function' && 'expanded' in (n as object)) {
				try {
					n.on('fold', this.onFold);
				} catch {
					// Some blades expose 'on' but not the 'fold' event: ignore.
				}
			}
			// Tab: exposes 'pages' in addition to 'on' -> persist the page change.
			if (typeof n.on === 'function' && Array.isArray(n.pages)) {
				try {
					n.on('select', this.onFold);
				} catch {
					// Ignore if the event is not supported.
				}
			}
			// Recursion: folder children and tab pages.
			if (Array.isArray(n.children)) {
				n.children.forEach(visit);
			}
			if (Array.isArray(n.pages)) {
				n.pages.forEach(visit);
			}
		};
		// Start from the root CHILDREN: the root fold is already handled separately.
		const rootNode = root as {children?: unknown[]};
		if (Array.isArray(rootNode.children)) {
			rootNode.children.forEach(visit);
		}
	}

	/**
	 * Restores the saved state by applying it to the pane.
	 * @returns true if a valid state was found and applied.
	 */
	public restore(): boolean {
		const scoped = this.storage.readJSON<SerializedState | null>(
			STATE_KEY,
			null,
		);
		if (!scoped || typeof scoped !== 'object') {
			return false;
		}
		try {
			const live = this.pane.exportState();
			// If the pane STRUCTURE has changed since the state was saved
			// (control added/removed/reordered), the positional importState would
			// apply it incorrectly, corrupting labels and values. We compare the
			// structure signatures and, if they differ, ignore the snapshot (default).
			const managerIndex = this.resolveManagerIndex();
			const currentScoped = stripManagerChild(live, managerIndex);
			if (structureSignature(scoped) !== structureSignature(currentScoped)) {
				return false;
			}
			// Re-insert the preset folder (live state) to satisfy the positional
			// match of the core importState.
			const full = mergeManagerChild(live, scoped, managerIndex);
			return this.pane.importState(full);
		} catch {
			// Incompatible state or error: do not break startup, ignore.
			return false;
		}
	}

	/** Resolves the preset folder index (fixed number or lazy resolver). */
	private resolveManagerIndex(): number {
		return typeof this.managerChildIndex === 'function'
			? this.managerChildIndex()
			: this.managerChildIndex;
	}

	/** Schedules a debounced save. */
	public scheduleSave(): void {
		if (this.disposed) {
			return;
		}
		this.debouncedSave();
	}

	/** Immediately saves the current scoped state to localStorage. */
	public saveNow(): void {
		if (this.disposed) {
			return;
		}
		try {
			const full = this.pane.exportState();
			const scoped = stripManagerChild(full, this.resolveManagerIndex());
			this.storage.writeJSON(STATE_KEY, scoped);
		} catch {
			// Export failed: best-effort, ignore.
		}
	}

	/** Removes the persisted state from storage. */
	public clear(): void {
		this.debouncedSave.cancel();
		this.storage.remove(STATE_KEY);
	}

	/** Tears down the handlers and cancels pending saves. */
	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.debouncedSave.cancel();
		this.pane.element.removeEventListener('click', this.onPaneClick);
		if (typeof window !== 'undefined') {
			window.removeEventListener('pagehide', this.onPageHide);
		}
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.onVisibilityChange);
		}
		// Note: Tweakpane does not expose `off` for change/fold at the Pane level
		// symmetrically to the `on` used here; the handlers stop having effects
		// anyway thanks to the `disposed` flag.
	}
}
