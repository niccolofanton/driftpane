import { SerializedState } from './types.js';
/** Number of children present in the exported state (0 if absent/invalid). */
export declare function childrenCount(state: SerializedState): number;
/**
 * STRUCTURE signature of a state: folder titles, binding keys and the shape of
 * the tree, IGNORING values and the `expanded` state. Used to tell whether two
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
 * @param managerChildIndex Index of the preset folder (typically the last one).
 */
export declare function mergeManagerChild(target: SerializedState, scoped: SerializedState, managerChildIndex: number): SerializedState;
/**
 * Returns a deep copy of `state` with every `expanded` field removed. Presets use
 * this so they do NOT store the open/closed state of folders/tabs — that memory
 * is GLOBAL (persisted in the `state` key), not per-preset.
 */
export declare function stripExpanded(state: SerializedState): SerializedState;
/**
 * Returns a copy of `target` in which every node's `expanded` field is taken from
 * the structurally-corresponding node in `source` (matched positionally by
 * `children`/`pages` index). Applied before importing a preset so applying it
 * keeps the CURRENT open/closed state of folders/tabs instead of forcing the
 * preset's — and supplies the `expanded` field that `importState` requires even
 * when the preset snapshot had it stripped.
 */
export declare function overlayExpanded(target: SerializedState, source: SerializedState): SerializedState;
