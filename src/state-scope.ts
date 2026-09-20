// Pure functions for "scoping" the state snapshot.
//
// CRITICAL CORE CONSTRAINT (verified in
// packages/core/src/blade/common/controller/container-blade.ts):
// `ContainerBladeController.importState` matches children POSITIONALLY
// (`rack.children[index].importState(result.children[index])`) and requires
// EVERY child to import successfully (`.every(...)`). In addition, the folder
// imports `expanded` as a REQUIRED field.
//
// At initialization the preset manager folder is appended to the pane. Including
// it in persisted snapshots or presets would:
//  - making the structure diverge across machines/sessions;
//  - overwriting the preset folder state.
// So we EXCLUDE it by its current index both on export and on import, and
// on import we reintroduce it by taking the LIVE state of the current preset
// folder, so the positional match stays valid. The index is passed by the caller
// as a resolver that tracks the actual manager folder (see driftpane.ts).

import {SerializedState} from './types.js';

/** Number of children present in the exported state (0 if absent/invalid). */
export function childrenCount(state: SerializedState): number {
	const children = state['children'];
	return Array.isArray(children) ? children.length : 0;
}

/**
 * STRUCTURE signature of a state: folder titles, binding keys/labels and the shape of
 * the tree, ignoring values and folder/tab navigation. Used to tell whether two
 * snapshots describe the same pane: the core `importState` is positional and
 * would misapply a state with a different structure (corrupting labels and
 * values), so we compare signatures before importing.
 */
export function structureSignature(state: SerializedState): string {
	const walk = (node: unknown): unknown => {
		if (!node || typeof node !== 'object') {
			return 0;
		}
		const o = node as Record<string, unknown>;
		const sig: Record<string, unknown> = {};
		if (typeof o['title'] === 'string') {
			sig['t'] = o['title'];
		}
		const binding = o['binding'];
		if (binding && typeof binding === 'object') {
			sig['b'] = (binding as Record<string, unknown>)['key'];
			sig['l'] = o['label'] ?? null;
			sig['r'] = (binding as Record<string, unknown>)['readonly'] === true;
		}
		if (Array.isArray(o['children'])) {
			sig['c'] = (o['children'] as unknown[]).map(walk);
		}
		if (Array.isArray(o['pages'])) {
			sig['p'] = (o['pages'] as unknown[]).map(walk);
		}
		return sig;
	};
	return JSON.stringify(walk(state));
}

/**
 * Returns a copy (shallow on the touched levels) of the `full` state in which
 * the child at index `managerChildIndex` (the preset folder) has been REMOVED
 * from the `children` array. Used before persisting/saving a preset.
 *
 * If the state has no valid `children` array or the index is out of range, an
 * unchanged copy is returned: the scoping is always defensive.
 */
export function stripManagerChild(
	full: SerializedState,
	managerChildIndex: number,
): SerializedState {
	const children = full['children'];
	if (!Array.isArray(children)) {
		return {...full};
	}
	if (managerChildIndex < 0 || managerChildIndex >= children.length) {
		return {...full};
	}
	const scopedChildren = children.slice();
	scopedChildren.splice(managerChildIndex, 1);
	return {
		...full,
		children: scopedChildren,
	};
}

/**
 * Inverse of `stripManagerChild`: takes a `scoped` state (without the preset
 * folder) and re-inserts, at index `managerChildIndex`, the preset folder state
 * taken from `target` (the current LIVE state of the pane). The result is a
 * complete state, positionally compatible with `importState`.
 *
 * @param target Current live state of the pane (must contain the preset folder
 *               at the expected index); provides the manager segment to re-insert.
 * @param scoped Scoped state to apply (user values/expanded).
 * @param managerChildIndex Current index of the actual mounted preset folder.
 */
export function mergeManagerChild(
	target: SerializedState,
	scoped: SerializedState,
	managerChildIndex: number,
): SerializedState {
	const targetChildren = target['children'];
	const scopedChildren = scoped['children'];

	// Without a valid children array in the target we cannot re-insert anything:
	// we return the scoped state as is (degenerate case, e.g. empty pane).
	if (!Array.isArray(targetChildren)) {
		return {...scoped};
	}

	// Retrieve the preset folder segment from the live state.
	const managerChild =
		managerChildIndex >= 0 && managerChildIndex < targetChildren.length
			? targetChildren[managerChildIndex]
			: undefined;

	const baseChildren = Array.isArray(scopedChildren)
		? scopedChildren.slice()
		: [];

	if (managerChild !== undefined) {
		baseChildren.splice(managerChildIndex, 0, managerChild);
	}

	// Keep the top-level fields from `scoped` (the pane's expanded/title), but
	// restore the full children array.
	return {
		...scoped,
		children: baseChildren,
	};
}

/** Tab page visibility is derived from selection, unlike ordinary blade visibility. */
function isTabPageState(node: Record<string, unknown>): boolean {
	return (
		typeof node['selected'] === 'boolean' &&
		typeof node['title'] === 'string' &&
		Array.isArray(node['children'])
	);
}

/**
 * Imports a full pane state and repairs Tweakpane 4's tab selection model.
 * Upstream imports the tab header/visibility but not TabPageApi.selected; using
 * the public setter makes subsequent clicks and select events work normally.
 */
export function importPaneState(
	pane: {
		importState(state: SerializedState): boolean;
		exportState?(): SerializedState;
	},
	state: SerializedState,
): boolean {
	const before = pane.exportState?.();
	const visit = (api: unknown, snapshot: unknown): void => {
		if (
			!api ||
			typeof api !== 'object' ||
			!snapshot ||
			typeof snapshot !== 'object'
		) {
			return;
		}
		const node = api as {
			children?: unknown[];
			pages?: Array<{selected: boolean}>;
		};
		const saved = snapshot as Record<string, unknown>;
		const states = Array.isArray(saved['children'])
			? saved['children']
			: saved['pages'];
		const children = Array.isArray(node.pages) ? node.pages : node.children;
		if (!Array.isArray(states) || !Array.isArray(children)) {
			return;
		}
		if (Array.isArray(node.pages)) {
			const selected = states.findIndex(
				(page: unknown) =>
					!!page &&
					typeof page === 'object' &&
					(page as Record<string, unknown>)['selected'] === true,
			);
			if (selected >= 0 && selected < node.pages.length) {
				node.pages[selected].selected = true;
			}
		}
		children.forEach((child, index) => visit(child, states[index]));
	};
	try {
		if (!pane.importState(state)) throw new Error('Incomplete state import');
		visit(pane, state);
		return true;
	} catch {
		// Tweakpane imports children sequentially: false can mean that a prefix
		// already changed. Restore values and the tab model before reporting failure.
		if (before) {
			try {
				pane.importState(before);
				visit(pane, before);
			} catch {
				// A consumer binding can itself throw; restoration is best effort.
			}
		}
		return false;
	}
}

/**
 * Returns a deep copy without folder expansion or tab selection/visibility.
 * The latter is recognized by the tab page's selected/title/children fields.
 * Presets use this to keep folder expansion and tab selection in the global
 * persisted `state` key rather than in each preset.
 */
export function stripExpanded(state: SerializedState): SerializedState {
	const walk = (node: unknown): unknown => {
		if (Array.isArray(node)) {
			return node.map(walk);
		}
		if (!node || typeof node !== 'object') {
			return node;
		}
		const o = node as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(o)) {
			if (
				key === 'expanded' ||
				(isTabPageState(o) && (key === 'selected' || key === 'hidden'))
			) {
				continue;
			}
			out[key] = walk(o[key]);
		}
		return out;
	};
	return walk(state) as SerializedState;
}

/**
 * Returns a deep copy of `state` with every READONLY binding value normalized to
 * `null`. Readonly bindings are live monitors (graphs, fps counters, ...) whose
 * value changes on (almost) every frame; normalizing them keeps the snapshot
 * STABLE across frames so they neither churn the share URL nor perpetually reset
 * its debounce (which would block realtime sync), and so they never leak into a
 * shared link. The tree STRUCTURE is preserved, so positional import stays valid.
 */
export function stripReadonly(state: SerializedState): SerializedState {
	const walk = (node: unknown): unknown => {
		if (Array.isArray(node)) {
			return node.map(walk);
		}
		if (!node || typeof node !== 'object') {
			return node;
		}
		const o = node as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const key of Object.keys(o)) {
			out[key] = walk(o[key]);
		}
		const binding = out['binding'];
		if (
			binding &&
			typeof binding === 'object' &&
			(binding as Record<string, unknown>)['readonly'] === true
		) {
			out['binding'] = {...(binding as Record<string, unknown>), value: null};
		}
		return out;
	};
	return walk(state) as SerializedState;
}

/**
 * Returns a copy of `target` in which expansion and tab navigation are taken from
 * the structurally-corresponding node in `source` (matched positionally by
 * `children`/`pages` index). Applied before importing a preset so applying it
 * keeps the CURRENT open/closed state of folders/tabs instead of forcing the
 * preset's — and supplies the `expanded` field that `importState` requires even
 * when the preset snapshot had it stripped.
 */
export function overlayExpanded(
	target: SerializedState,
	source: SerializedState,
): SerializedState {
	const walk = (t: unknown, s: unknown): unknown => {
		if (Array.isArray(t)) {
			return t.map((item, i) =>
				walk(item, Array.isArray(s) ? s[i] : undefined),
			);
		}
		if (!t || typeof t !== 'object') {
			return t;
		}
		const to = t as Record<string, unknown>;
		const so =
			s && typeof s === 'object' ? (s as Record<string, unknown>) : undefined;
		const out: Record<string, unknown> = {...to};
		if (so && 'expanded' in so) {
			out['expanded'] = so['expanded'];
		}
		if (so && isTabPageState(so)) {
			out['selected'] = so['selected'];
			out['hidden'] = so['hidden'];
		}
		if ('children' in to) {
			out['children'] = walk(to['children'], so ? so['children'] : undefined);
		}
		if ('pages' in to) {
			out['pages'] = walk(to['pages'], so ? so['pages'] : undefined);
		}
		return out;
	};
	return walk(target, source) as SerializedState;
}

// --- Key-path merge (structure-mismatch path) ----------------------------
//
// When a shared snapshot has a DIFFERENT structure than the live pane (a
// binding added/removed, folders reshuffled), the positional importState would
// corrupt values. Instead we apply values by IDENTITY = the path of folder/tab
// titles from the root + the `binding.key`. Bindings present on both sides are
// copied; the rest keep their current value. As a fallback, a binding whose key
// is GLOBALLY UNIQUE on both sides is matched on the key alone (so a renamed
// folder does not lose it). The result keeps the LIVE structure, so it remains
// importable positionally.

/** Separator unlikely to occur inside folder titles / binding keys. */
const PATH_SEP = ' ';

/** Returns the `{key, value}` of a binding node, or null for non-binding nodes. */
function bindingOf(node: unknown): {key: string; value: unknown} | null {
	if (!node || typeof node !== 'object') {
		return null;
	}
	const binding = (node as Record<string, unknown>)['binding'];
	if (
		binding &&
		typeof binding === 'object' &&
		typeof (binding as Record<string, unknown>)['key'] === 'string'
	) {
		return binding as {key: string; value: unknown};
	}
	return null;
}

/** Title of a folder/tab/page node, if any. */
function titleOf(node: unknown): string | null {
	if (!node || typeof node !== 'object') {
		return null;
	}
	const title = (node as Record<string, unknown>)['title'];
	return typeof title === 'string' ? title : null;
}

interface CollectedBindings {
	/** pathStr -> value (only when the path is unique). */
	byPath: Map<string, unknown>;
	/** Paths seen more than once (ambiguous): excluded from byPath matching. */
	dupPaths: Set<string>;
	/** leafKey -> value (last wins; only meaningful when the key count is 1). */
	byKey: Map<string, unknown>;
	/** Occurrences of each leaf key. */
	keyCount: Map<string, number>;
}

/** Walks a state tree collecting binding values by path and by key. */
function collectBindings(state: SerializedState): CollectedBindings {
	const byPath = new Map<string, unknown>();
	const dupPaths = new Set<string>();
	const byKey = new Map<string, unknown>();
	const keyCount = new Map<string, number>();

	const visit = (node: unknown, titlePath: string[]): void => {
		if (Array.isArray(node)) {
			node.forEach((child) => visit(child, titlePath));
			return;
		}
		if (!node || typeof node !== 'object') {
			return;
		}
		const o = node as Record<string, unknown>;
		const binding = bindingOf(o);
		if (binding) {
			const pathStr = [...titlePath, binding.key].join(PATH_SEP);
			if (byPath.has(pathStr)) {
				dupPaths.add(pathStr);
			} else {
				byPath.set(pathStr, binding.value);
			}
			keyCount.set(binding.key, (keyCount.get(binding.key) ?? 0) + 1);
			byKey.set(binding.key, binding.value);
		}
		const title = titleOf(o);
		const nextPath = title !== null ? [...titlePath, title] : titlePath;
		if (Array.isArray(o['children'])) {
			visit(o['children'], nextPath);
		}
		if (Array.isArray(o['pages'])) {
			visit(o['pages'], nextPath);
		}
	};

	visit(state, []);
	return {byPath, dupPaths, byKey, keyCount};
}

/**
 * Returns a copy of `target` (the live, locally-structured state) in which each
 * binding value is overwritten with the matching value from `source` (a shared
 * snapshot of possibly different structure), matched by folder-path + key, with
 * a unique-leaf-key fallback. Bindings without a match keep their value.
 */
export function mergeByPath(
	target: SerializedState,
	source: SerializedState,
): SerializedState {
	const src = collectBindings(source);
	const tgt = collectBindings(target);

	const walk = (node: unknown, titlePath: string[]): unknown => {
		if (Array.isArray(node)) {
			return node.map((child) => walk(child, titlePath));
		}
		if (!node || typeof node !== 'object') {
			return node;
		}
		const o = node as Record<string, unknown>;
		const out: Record<string, unknown> = {...o};
		const binding = bindingOf(o);
		if (binding) {
			const pathStr = [...titlePath, binding.key].join(PATH_SEP);
			let value: unknown;
			let matched = false;
			if (
				src.byPath.has(pathStr) &&
				!src.dupPaths.has(pathStr) &&
				!tgt.dupPaths.has(pathStr)
			) {
				value = src.byPath.get(pathStr);
				matched = true;
			} else if (
				(src.keyCount.get(binding.key) ?? 0) === 1 &&
				(tgt.keyCount.get(binding.key) ?? 0) === 1
			) {
				value = src.byKey.get(binding.key);
				matched = true;
			}
			if (matched) {
				out['binding'] = {
					...(o['binding'] as Record<string, unknown>),
					value,
				};
			}
		}
		const title = titleOf(o);
		const nextPath = title !== null ? [...titlePath, title] : titlePath;
		if (Array.isArray(o['children'])) {
			out['children'] = (o['children'] as unknown[]).map((child) =>
				walk(child, nextPath),
			);
		}
		if (Array.isArray(o['pages'])) {
			out['pages'] = (o['pages'] as unknown[]).map((page) =>
				walk(page, nextPath),
			);
		}
		return out;
	};

	return walk(target, []) as SerializedState;
}

/**
 * Builds a full, positionally-importable state that applies a shared scoped
 * snapshot onto the live pane:
 *  - if the structures match exactly, the shared values are used directly;
 *  - otherwise values are merged by path (see {@link mergeByPath});
 * then the preset folder is re-inserted (live segment) and the CURRENT
 * `expanded` state is overlaid (importState requires `expanded`, and folds are
 * global, not shared).
 *
 * @param liveFull         Current full pane state (`pane.exportState()`).
 * @param sourceScoped     Shared scoped snapshot (without the preset folder).
 * @param managerChildIndex Index of the preset folder (last child), or -1.
 */
export function buildSharedImport(
	liveFull: SerializedState,
	sourceScoped: SerializedState,
	managerChildIndex: number,
): SerializedState {
	const liveScoped = stripManagerChild(liveFull, managerChildIndex);
	const appliedScoped =
		structureSignature(sourceScoped) === structureSignature(liveScoped)
			? sourceScoped
			: mergeByPath(liveScoped, sourceScoped);
	const full = mergeManagerChild(liveFull, appliedScoped, managerChildIndex);
	// Keep the receiving pane and its reconciliation controls reachable. Child
	// visibility remains shareable, but root chrome belongs to the receiver.
	full['hidden'] = liveFull['hidden'];
	full['disabled'] = liveFull['disabled'];
	return overlayExpanded(full, liveFull);
}
