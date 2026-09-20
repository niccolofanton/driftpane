// Feature 4 (logic): preset store management.
//
// A preset = named snapshot of `pane.exportState()` SCOPED (without the preset
// folder). The controller handles CRUD on the persisted collection, the scoped
// snapshot, application via importState, and JSON import/export. It is
// independent of the UI (see preset-menu.ts).
//
// Exported JSON file format (versioned envelope), per the agreed design:
//   {
//     "format": "driftpane-presets",
//     "version": 1,
//     "exportedAt": "<ISO>",
//     "active": "<active preset id or null>",
//     "presets": [ DriftpanePreset, ... ]
//   }
// The import accepts the collection envelope, a single "bare" DriftpanePreset,
// or a raw exportState state (BladeState) -> new preset.
import { importPaneState, mergeManagerChild, overlayExpanded, stripExpanded, stripManagerChild, stripReadonly, structureSignature, } from './state-scope.js';
/** localStorage key suffix for the preset collection. */
const PRESETS_KEY = 'presets';
/** Format tag of the exported file. */
const EXPORT_FORMAT = 'driftpane-presets';
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
/** Validate only common state fields, leaving plugin-specific data untouched. */
function isState(value) {
    if (!isRecord(value))
        return false;
    for (const field of ['disabled', 'hidden', 'expanded', 'selected']) {
        if (field in value && typeof value[field] !== 'boolean')
            return false;
    }
    for (const field of ['children', 'pages']) {
        if (field in value &&
            (!Array.isArray(value[field]) || !value[field].every(isState)))
            return false;
    }
    if ('binding' in value) {
        if (!isRecord(value['binding']) ||
            typeof value['binding']['key'] !== 'string')
            return false;
        if ('readonly' in value['binding'] &&
            typeof value['binding']['readonly'] !== 'boolean')
            return false;
    }
    return true;
}
function hasSupportedVersion(value) {
    return value['version'] === undefined || value['version'] === 1;
}
/** Generates a unique id, with a fallback if crypto.randomUUID is unavailable. */
function generateId() {
    try {
        if (typeof crypto !== 'undefined' &&
            typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    }
    catch {
        // Fall through to the fallback.
    }
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
export class PresetController {
    constructor(pane, storage, opts) {
        this.listeners = new Set();
        this.factoryCaptured = false;
        this.pane = pane;
        this.storage = storage;
        this.managerChildIndex = opts.managerChildIndex;
        this.store = this.loadStore();
    }
    /** Resolves the preset folder index (fixed number or lazy resolver). */
    resolveManagerIndex() {
        return typeof this.managerChildIndex === 'function'
            ? this.managerChildIndex()
            : this.managerChildIndex;
    }
    /** Observe collection or active identity changes. Returns an unsubscribe function. */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    /** Replace a backup collection while retaining this app's current factory baseline. */
    replaceStore(value) {
        if (!isRecord(value) ||
            !hasSupportedVersion(value) ||
            !Array.isArray(value['presets'])) {
            throw new Error('Invalid preset store');
        }
        const incoming = value;
        const coerced = incoming.presets.map((p) => this.coercePreset(p));
        if (coerced.some((p) => p === null)) {
            throw new Error('Invalid preset store');
        }
        const baseline = this.store.presets.find((p) => p.custom === false);
        const presets = baseline ? [baseline] : [];
        let activeId = null;
        let baselineSeen = false;
        for (const item of coerced) {
            if (!item)
                continue;
            if (item.custom === false && !baselineSeen) {
                baselineSeen = true;
                if (item.id === incoming.activeId)
                    activeId = baseline?.id ?? null;
                continue;
            }
            // Older imports could create additional protected Defaults. Preserve
            // their data as custom presets instead of silently dropping them.
            const preset = {
                ...item,
                custom: true,
                id: presets.some((p) => p.id === item.id) ? generateId() : item.id,
            };
            presets.push(preset);
            if (item.id === incoming.activeId)
                activeId = preset.id;
        }
        this.store = {
            version: 1,
            presets,
            activeId: activeId ?? presets[0]?.id ?? null,
        };
        this.persist();
    }
    // --- Reading ------------------------------------------------------------
    /** List of presets (defensive copy of the array). */
    list() {
        return this.store.presets.slice();
    }
    /** Id of the active preset (or null). */
    activeId() {
        return this.store.activeId;
    }
    /** Returns a preset by id, or undefined. */
    get(id) {
        return this.store.presets.find((p) => p.id === id);
    }
    // --- Writing / CRUD -----------------------------------------------------
    /** Creates a new CUSTOM preset from the current scoped snapshot. */
    save(name) {
        const now = Date.now();
        const preset = {
            id: generateId(),
            name: name.trim() || 'Untitled',
            createdAt: now,
            updatedAt: now,
            state: this.snapshot(),
            custom: true,
        };
        this.store.presets.push(preset);
        this.store.activeId = preset.id;
        this.persist();
        return preset;
    }
    /**
     * Default name proposed for "save as new preset": the active preset name
     * with the " (copy)" suffix, or 'Preset' if there is no active preset.
     */
    suggestedNewName() {
        const active = this.store.activeId
            ? this.get(this.store.activeId)
            : undefined;
        return active ? `${active.name} (copy)` : 'Preset';
    }
    /** Name of the active preset (or null). */
    activeName() {
        const active = this.store.activeId
            ? this.get(this.store.activeId)
            : undefined;
        return active?.name ?? null;
    }
    /** Overwrites the ACTIVE preset with the current snapshot (no-op if absent). */
    overwriteActive() {
        const id = this.store.activeId;
        if (!id || !this.isActiveDeletable()) {
            return false;
        }
        this.overwrite(id);
        return true;
    }
    /**
     * true if the live pane state differs from the active preset snapshot (i.e.
     * there are unsaved changes). false if there is no active preset or they match.
     */
    isModified() {
        const id = this.store.activeId;
        const active = id ? this.get(id) : undefined;
        if (!active) {
            return false;
        }
        try {
            return (JSON.stringify(stripReadonly(this.snapshot())) !==
                JSON.stringify(stripReadonly(stripExpanded(active.state))));
        }
        catch {
            return false;
        }
    }
    /**
     * Restores the active preset, discarding live changes (re-applies its
     * snapshot). @returns true if applied.
     */
    revert() {
        const id = this.store.activeId;
        return id ? this.apply(id) : false;
    }
    /** true if the active preset exists and is CUSTOM (hence deletable). */
    isActiveDeletable() {
        const id = this.store.activeId;
        const active = id ? this.get(id) : undefined;
        return !!active && active.custom !== false;
    }
    /**
     * Deletes the ACTIVE preset if it is custom. @returns true if deleted.
     */
    removeActive() {
        if (!this.isActiveDeletable()) {
            return false;
        }
        const id = this.store.activeId;
        this.remove(id);
        return true;
    }
    /**
     * Captures the current app's DEFAULT preset once per controller session.
     * An existing baseline keeps its identity but receives the current factory
     * values and structure. Otherwise a non-deletable, non-overwritable baseline
     * is created and becomes active if nothing else is selected.
     * Must be called AFTER mounting the preset folder and BEFORE restoring
     * persistence (so it captures the factory defaults).
     * @returns true if the default was created.
     */
    ensureDefault(name = 'Default') {
        if (this.factoryCaptured)
            return false;
        this.factoryCaptured = true;
        const baseline = this.store.presets.find((p) => p.custom === false);
        if (baseline) {
            // The baseline belongs to the current application build, not the last
            // persisted session. Keep its identity and name while refreshing defaults.
            const state = this.snapshot();
            if (JSON.stringify(baseline.state) !== JSON.stringify(state)) {
                baseline.state = state;
                baseline.updatedAt = Date.now();
                this.persist();
            }
            return false;
        }
        const now = Date.now();
        const preset = {
            id: generateId(),
            name: name.trim() || 'Default',
            createdAt: now,
            updatedAt: now,
            state: this.snapshot(),
            custom: false,
        };
        // At the top: it is the baseline, before the user's custom presets.
        this.store.presets.unshift(preset);
        if (this.store.activeId === null) {
            this.store.activeId = preset.id;
        }
        this.persist();
        return true;
    }
    /** Overwrites an existing preset's state with the current snapshot. */
    overwrite(id) {
        const preset = this.get(id);
        if (!preset) {
            throw new Error(`Preset not found: ${id}`);
        }
        if (preset.custom === false) {
            throw new Error('The default preset cannot be overwritten');
        }
        preset.state = this.snapshot();
        preset.updatedAt = Date.now();
        this.store.activeId = preset.id;
        this.persist();
        return preset;
    }
    /**
     * Applies a preset to the pane via importState.
     * @returns true if the application succeeded.
     */
    apply(id) {
        const preset = this.get(id);
        if (!preset) {
            return false;
        }
        try {
            const live = this.pane.exportState();
            const managerIndex = this.resolveManagerIndex();
            // Preset structure differs from the current one -> do not apply
            // (positional import would corrupt labels/values).
            const currentScoped = stripManagerChild(live, managerIndex);
            if (structureSignature(preset.state) !== structureSignature(currentScoped)) {
                return false;
            }
            // Re-insert the preset folder (live state) for the positional match,
            // then overlay the CURRENT `expanded` state so applying a preset never
            // changes which folders/tabs are open (that memory is global).
            const full = overlayExpanded(mergeManagerChild(live, preset.state, managerIndex), live);
            const ok = importPaneState(this.pane, full);
            if (ok) {
                this.store.activeId = preset.id;
                this.persist();
            }
            return ok;
        }
        catch {
            return false;
        }
    }
    /** Removes a preset. */
    remove(id) {
        const idx = this.store.presets.findIndex((p) => p.id === id);
        if (idx < 0 || this.store.presets[idx].custom === false) {
            return;
        }
        this.store.presets.splice(idx, 1);
        if (this.store.activeId === id) {
            this.store.activeId = this.store.presets[0]?.id ?? null;
        }
        this.persist();
    }
    /** Renames a preset. */
    rename(id, name) {
        const preset = this.get(id);
        if (!preset) {
            return;
        }
        preset.name = name.trim() || preset.name;
        preset.updatedAt = Date.now();
        this.persist();
    }
    // --- URL sharing --------------------------------------------------------
    /** Scoped, expanded-stripped snapshot of the current live state. */
    currentSnapshot() {
        return this.snapshot();
    }
    /**
     * Identity of the active preset for stamping the share URL: custom presets
     * carry their UUID; built-in/default presets carry a name marker (so they are
     * never overwritten on the other side). Null when there is no active preset.
     */
    activeIdentity() {
        const id = this.store.activeId;
        const active = id ? this.get(id) : undefined;
        if (!active) {
            return null;
        }
        if (active.custom === false) {
            return { name: active.name, isDefault: true };
        }
        return { id: active.id, name: active.name, isDefault: false };
    }
    /**
     * Resolves what opening a shared link would do, WITHOUT applying it: overwrite
     * an existing custom preset (same UUID), or import as new.
     */
    resolveSharedAction(env) {
        if (!env.d && typeof env.id === 'string') {
            const existing = this.get(env.id);
            if (existing && existing.custom !== false) {
                return { action: 'overwrite', existingName: existing.name };
            }
        }
        return { action: 'import' };
    }
    /**
     * Accepts a shared link by OVERWRITING the existing preset with the same id,
     * capturing the current (previewed) live state. No-op if the id is unknown.
     */
    acceptSharedOverwrite(id) {
        const preset = this.get(id);
        if (preset && preset.custom !== false) {
            this.overwrite(id);
        }
    }
    /**
     * Accepts a shared link by IMPORTING it as a preset, capturing the current
     * (previewed) live state as the snapshot:
     *  - custom uuid not in the store -> create preserving the id;
     *  - name-marker / no id -> idempotent by content (activate an identical preset
     *    if present), else create a new `"<name> (imported[ N])"`.
     */
    acceptSharedImport(env) {
        const state = this.snapshot();
        const now = Date.now();
        if (!env.d && typeof env.id === 'string') {
            const id = this.get(env.id) ? generateId() : env.id;
            const preset = {
                id,
                name: env.n || 'Imported',
                createdAt: now,
                updatedAt: now,
                state,
                custom: true,
            };
            this.store.presets.push(preset);
            this.store.activeId = preset.id;
            this.persist();
            return preset;
        }
        // Name-marker import: idempotent by content.
        const serialized = JSON.stringify(state);
        const equivalent = this.store.presets.find((p) => JSON.stringify(p.state) === serialized);
        if (equivalent) {
            this.store.activeId = equivalent.id;
            this.persist();
            return equivalent;
        }
        const preset = {
            id: generateId(),
            name: this.uniqueImportedName(env.n || 'Preset'),
            createdAt: now,
            updatedAt: now,
            state,
            custom: true,
        };
        this.store.presets.push(preset);
        this.store.activeId = preset.id;
        this.persist();
        return preset;
    }
    /** Unique `"<base> (imported)"` name, numbering on collision. */
    uniqueImportedName(base) {
        const exists = (name) => this.store.presets.some((p) => p.name === name);
        const first = `${base} (imported)`;
        if (!exists(first)) {
            return first;
        }
        let i = 2;
        while (exists(`${base} (imported ${i})`)) {
            i += 1;
        }
        return `${base} (imported ${i})`;
    }
    // --- Export / Import JSON ----------------------------------------------
    /** Serializes the ENTIRE collection into a versioned JSON envelope. */
    exportJSON() {
        const envelope = {
            format: EXPORT_FORMAT,
            version: 1,
            exportedAt: new Date().toISOString(),
            active: this.store.activeId,
            presets: this.store.presets,
        };
        return JSON.stringify(envelope, null, 2);
    }
    /** Serializes a single preset (programmatic API, not wired into the UI). */
    exportPresetJSON(id) {
        const preset = this.get(id);
        if (!preset) {
            throw new Error(`Preset not found: ${id}`);
        }
        return JSON.stringify(preset, null, 2);
    }
    /**
     * Imports from a JSON string. Recognizes:
     *  - collection envelope ({ presets: [...] }) -> merge (colliding ids regenerated);
     *  - single bare preset ({ name, state }) -> added as new;
     *  - raw exportState ({ children: [...] } without name) -> new preset.
     * Defensive validation: malformed input throws a catchable Error.
     * @returns number of imported presets.
     */
    importJSON(raw) {
        let parsed;
        try {
            parsed = JSON.parse(raw);
        }
        catch {
            throw new Error('Invalid JSON');
        }
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Unrecognized JSON content');
        }
        const obj = parsed;
        if (!hasSupportedVersion(obj) ||
            (obj['format'] !== undefined && obj['format'] !== EXPORT_FORMAT)) {
            throw new Error('Unsupported preset format or version');
        }
        // Final ids (after possible regeneration on collision) of the imported
        // presets: the menu needs them to select/apply them immediately.
        const ids = [];
        if (Array.isArray(obj['presets'])) {
            // Collection envelope.
            const incoming = obj['presets'];
            for (const item of incoming) {
                const preset = this.coercePreset(item);
                if (preset) {
                    ids.push(this.addImportedPreset(preset));
                }
            }
        }
        else if (this.isPresetShape(obj)) {
            // Single bare preset.
            const preset = this.coercePreset(obj);
            if (preset) {
                ids.push(this.addImportedPreset(preset));
            }
        }
        else if (isState(obj) &&
            (Array.isArray(obj['children']) || 'binding' in obj)) {
            // Raw exportState: we wrap it in a new preset.
            const now = Date.now();
            ids.push(this.addImportedPreset({
                id: generateId(),
                name: 'Imported',
                createdAt: now,
                updatedAt: now,
                state: this.normalizeRawState(obj),
                custom: true,
            }));
        }
        else {
            throw new Error('Unrecognized JSON format');
        }
        if (ids.length > 0) {
            this.persist();
        }
        return { imported: ids.length, ids };
    }
    /** Accept both scoped snapshots and full exports containing our manager folder. */
    normalizeRawState(state) {
        const live = this.pane.exportState();
        const managerIndex = this.resolveManagerIndex();
        const children = state['children'];
        const liveChildren = live['children'];
        if (managerIndex >= 0 &&
            Array.isArray(children) &&
            Array.isArray(liveChildren) &&
            children.length === liveChildren.length &&
            structureSignature(children[managerIndex]) ===
                structureSignature(liveChildren[managerIndex])) {
            return stripExpanded(stripManagerChild(state, managerIndex));
        }
        return stripExpanded(state);
    }
    // --- Private snapshot ---------------------------------------------------
    /** Scoped snapshot (without the preset folder) of the pane's current state. */
    snapshot() {
        const full = this.pane.exportState();
        // Strip `expanded` so presets do NOT carry the open/closed state of
        // folders/tabs: that memory is GLOBAL (the `state` key), not per-preset.
        return stripExpanded(stripManagerChild(full, this.resolveManagerIndex()));
    }
    // --- Internal persistence -----------------------------------------------
    loadStore() {
        const fallback = {
            version: 1,
            activeId: null,
            presets: [],
        };
        const loaded = this.storage.readJSON(PRESETS_KEY, fallback);
        // A fallback would be persisted by ensureDefault, destroying a store
        // written by a newer build. Refuse that downgrade without writing it.
        if (isRecord(loaded) && !hasSupportedVersion(loaded)) {
            throw new Error('Unsupported preset store version');
        }
        if (!isRecord(loaded) || !Array.isArray(loaded.presets))
            return fallback;
        const presets = [];
        let baselineSeen = false;
        for (const item of loaded.presets) {
            const preset = this.coercePreset(item);
            if (!preset)
                continue;
            if (preset.custom === false) {
                if (baselineSeen)
                    preset.custom = true;
                baselineSeen = true;
            }
            if (presets.some((p) => p.id === preset.id))
                preset.id = generateId();
            presets.push(preset);
        }
        return {
            version: 1,
            activeId: presets.some((p) => p.id === loaded.activeId)
                ? loaded.activeId
                : (presets[0]?.id ?? null),
            presets,
        };
    }
    persist() {
        this.storage.writeJSON(PRESETS_KEY, this.store);
        for (const listener of this.listeners) {
            try {
                listener();
            }
            catch {
                /* An observer must not interrupt a completed mutation. */
            }
        }
    }
    isPresetShape(o) {
        if (!isRecord(o) || typeof o['name'] !== 'string' || !isState(o['state']))
            return false;
        const state = o['state'];
        return (Array.isArray(state['children']) ||
            Array.isArray(state['pages']) ||
            isRecord(state['binding']));
    }
    /** Coerces an unknown object into a valid DriftpanePreset, or null. */
    coercePreset(item) {
        if (!item || typeof item !== 'object') {
            return null;
        }
        const o = item;
        if (!this.isPresetShape(o)) {
            return null;
        }
        const now = Date.now();
        return {
            id: typeof o['id'] === 'string' &&
                o['id'].trim() !== '' &&
                o['id'] !== '__none__'
                ? o['id']
                : generateId(),
            name: o['name'],
            createdAt: typeof o['createdAt'] === 'number' ? o['createdAt'] : now,
            updatedAt: typeof o['updatedAt'] === 'number' ? o['updatedAt'] : now,
            state: stripExpanded(o['state']),
            // Preserve the flag for store restoration; file imports normalize it below.
            custom: o['custom'] === false ? false : true,
        };
    }
    /**
     * Adds an imported preset, handling id collisions.
     * @returns the final id (possibly regenerated).
     */
    addImportedPreset(preset) {
        // A file import belongs to the recipient. Only ensureDefault creates a
        // protected factory baseline, regardless of the source file's flag.
        preset = { ...preset, custom: true };
        // Colliding id -> regenerate a new one to avoid conflicts.
        if (this.store.presets.some((p) => p.id === preset.id)) {
            preset = { ...preset, id: generateId() };
        }
        this.store.presets.push(preset);
        return preset.id;
    }
}
//# sourceMappingURL=presets.js.map