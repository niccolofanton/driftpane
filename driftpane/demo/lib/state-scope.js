// Pure functions for "scoping" the state snapshot.
//
// CRITICAL CORE CONSTRAINT (verified in
// packages/core/src/blade/common/controller/container-blade.ts):
// `ContainerBladeController.importState` matches children POSITIONALLY
// (`rack.children[index].importState(result.children[index])`) and requires
// EVERY child to import successfully (`.every(...)`). In addition, the folder
// imports `expanded` as a REQUIRED field.
//
// At runtime the LAST child of the pane is the preset manager folder (we append
// it at the end). If we included it in the persisted snapshot or in the presets,
// on re-import it would end up:
//  - making the structure diverge across machines/sessions;
//  - overwriting the preset folder state.
// So we EXCLUDE it by index (the last child) both on export and on import, and
// on import we reintroduce it by taking the LIVE state of the current preset
// folder, so the positional match stays valid. The index is passed by the caller
// as a resolver "() => last index" (see driftpane.ts).
/** Number of children present in the exported state (0 if absent/invalid). */
export function childrenCount(state) {
    const children = state['children'];
    return Array.isArray(children) ? children.length : 0;
}
/**
 * STRUCTURE signature of a state: folder titles, binding keys and the shape of
 * the tree, IGNORING values and the `expanded` state. Used to tell whether two
 * snapshots describe the same pane: the core `importState` is positional and
 * would misapply a state with a different structure (corrupting labels and
 * values), so we compare signatures before importing.
 */
export function structureSignature(state) {
    const walk = (node) => {
        if (!node || typeof node !== 'object') {
            return 0;
        }
        const o = node;
        const sig = {};
        if (typeof o['title'] === 'string') {
            sig['t'] = o['title'];
        }
        const binding = o['binding'];
        if (binding && typeof binding === 'object') {
            sig['b'] = binding['key'];
        }
        if (Array.isArray(o['children'])) {
            sig['c'] = o['children'].map(walk);
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
export function stripManagerChild(full, managerChildIndex) {
    const children = full['children'];
    if (!Array.isArray(children)) {
        return { ...full };
    }
    if (managerChildIndex < 0 || managerChildIndex >= children.length) {
        return { ...full };
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
 * @param managerChildIndex Index of the preset folder (typically the last one).
 */
export function mergeManagerChild(target, scoped, managerChildIndex) {
    const targetChildren = target['children'];
    const scopedChildren = scoped['children'];
    // Without a valid children array in the target we cannot re-insert anything:
    // we return the scoped state as is (degenerate case, e.g. empty pane).
    if (!Array.isArray(targetChildren)) {
        return { ...scoped };
    }
    // Retrieve the preset folder segment from the live state.
    const managerChild = managerChildIndex >= 0 && managerChildIndex < targetChildren.length
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
/**
 * Returns a deep copy of `state` with every `expanded` field removed. Presets use
 * this so they do NOT store the open/closed state of folders/tabs — that memory
 * is GLOBAL (persisted in the `state` key), not per-preset.
 */
export function stripExpanded(state) {
    const walk = (node) => {
        if (Array.isArray(node)) {
            return node.map(walk);
        }
        if (!node || typeof node !== 'object') {
            return node;
        }
        const o = node;
        const out = {};
        for (const key of Object.keys(o)) {
            if (key === 'expanded') {
                continue;
            }
            out[key] = walk(o[key]);
        }
        return out;
    };
    return walk(state);
}
/**
 * Returns a copy of `target` in which every node's `expanded` field is taken from
 * the structurally-corresponding node in `source` (matched positionally by
 * `children`/`pages` index). Applied before importing a preset so applying it
 * keeps the CURRENT open/closed state of folders/tabs instead of forcing the
 * preset's — and supplies the `expanded` field that `importState` requires even
 * when the preset snapshot had it stripped.
 */
export function overlayExpanded(target, source) {
    const walk = (t, s) => {
        if (Array.isArray(t)) {
            return t.map((item, i) => walk(item, Array.isArray(s) ? s[i] : undefined));
        }
        if (!t || typeof t !== 'object') {
            return t;
        }
        const to = t;
        const so = s && typeof s === 'object' ? s : undefined;
        const out = { ...to };
        if (so && 'expanded' in so) {
            out['expanded'] = so['expanded'];
        }
        if ('children' in to) {
            out['children'] = walk(to['children'], so ? so['children'] : undefined);
        }
        if ('pages' in to) {
            out['pages'] = walk(to['pages'], so ? so['pages'] : undefined);
        }
        return out;
    };
    return walk(target, source);
}
//# sourceMappingURL=state-scope.js.map