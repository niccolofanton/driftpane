import { SerializedState } from './types.js';
/** Number of children present in the exported state (0 if absent/invalid). */
export declare function childrenCount(state: SerializedState): number;
/**
 * STRUCTURE signature of a state: folder titles, binding keys/labels and the shape of
 * the tree, ignoring values and folder/tab navigation. Used to tell whether two
 * snapshots describe the same pane: the core `importState` is positional and
 * would misapply a state with a different structure (corrupting labels and
 * values), so we compare signatures before importing.
 */
export declare function structureSignature(state: SerializedState): string;
/**
 * Returns a copy (shallow on the touched levels) of the `full` state in which
 * the child at index `managerChildIndex` (the preset folder) has been REMOVED
 * from the `children` array. Used before persisting/saving a preset.
 *
 * If the state has no valid `children` array or the index is out of range, an
 * unchanged copy is returned: the scoping is always defensive.
 */
export declare function stripManagerChild(full: SerializedState, managerChildIndex: number): SerializedState;
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
export declare function mergeManagerChild(target: SerializedState, scoped: SerializedState, managerChildIndex: number): SerializedState;
/**
 * Imports a full pane state and repairs Tweakpane 4's tab selection model.
 * Upstream imports the tab header/visibility but not TabPageApi.selected; using
 * the public setter makes subsequent clicks and select events work normally.
 */
export declare function importPaneState(pane: {
    importState(state: SerializedState): boolean;
    exportState?(): SerializedState;
}, state: SerializedState): boolean;
/**
 * Returns a deep copy without folder expansion or tab selection/visibility.
 * The latter is recognized by the tab page's selected/title/children fields.
 * Presets use this to keep folder expansion and tab selection in the global
 * persisted `state` key rather than in each preset.
 */
export declare function stripExpanded(state: SerializedState): SerializedState;
/**
 * Returns a deep copy of `state` with every READONLY binding value normalized to
 * `null`. Readonly bindings are live monitors (graphs, fps counters, ...) whose
 * value changes on (almost) every frame; normalizing them keeps the snapshot
 * STABLE across frames so they neither churn the share URL nor perpetually reset
 * its debounce (which would block realtime sync), and so they never leak into a
 * shared link. The tree STRUCTURE is preserved, so positional import stays valid.
 */
export declare function stripReadonly(state: SerializedState): SerializedState;
/**
 * Returns a copy of `target` in which expansion and tab navigation are taken from
 * the structurally-corresponding node in `source` (matched positionally by
 * `children`/`pages` index). Applied before importing a preset so applying it
 * keeps the CURRENT open/closed state of folders/tabs instead of forcing the
 * preset's — and supplies the `expanded` field that `importState` requires even
 * when the preset snapshot had it stripped.
 */
export declare function overlayExpanded(target: SerializedState, source: SerializedState): SerializedState;
/**
 * Returns a copy of `target` (the live, locally-structured state) in which each
 * binding value is overwritten with the matching value from `source` (a shared
 * snapshot of possibly different structure), matched by folder-path + key, with
 * a unique-leaf-key fallback. Bindings without a match keep their value.
 */
export declare function mergeByPath(target: SerializedState, source: SerializedState): SerializedState;
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
export declare function buildSharedImport(liveFull: SerializedState, sourceScoped: SerializedState, managerChildIndex: number): SerializedState;
