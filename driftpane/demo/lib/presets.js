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
import { mergeManagerChild, stripManagerChild, structureSignature, } from './state-scope.js';
/** localStorage key suffix for the preset collection. */
const PRESETS_KEY = 'presets';
/** Format tag of the exported file. */
const EXPORT_FORMAT = 'driftpane-presets';
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
        if (!id || !this.get(id)) {
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
            return JSON.stringify(this.snapshot()) !== JSON.stringify(active.state);
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
     * Ensures a DEFAULT preset exists (custom: false): if no default preset is
     * already present, creates one by capturing the current snapshot (the pane's
     * initial state) as a NON-deletable, non-overwritable baseline, to be used as
     * the target of "Restore". If there is no active preset, it makes it active.
     * Must be called AFTER mounting the preset folder and BEFORE restoring
     * persistence (so it captures the factory defaults).
     * @returns true if the default was created.
     */
    ensureDefault(name = 'Default') {
        if (this.store.presets.some((p) => p.custom === false)) {
            return false; // a default preset already exists
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
            // Re-insert the preset folder (live state) for the positional match.
            const full = mergeManagerChild(live, preset.state, managerIndex);
            const ok = this.pane.importState(full);
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
        if (idx < 0) {
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
        else if (Array.isArray(obj['children']) || 'binding' in obj) {
            // Raw exportState: we wrap it in a new preset.
            const now = Date.now();
            ids.push(this.addImportedPreset({
                id: generateId(),
                name: 'Imported',
                createdAt: now,
                updatedAt: now,
                state: obj,
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
    // --- Private snapshot ---------------------------------------------------
    /** Scoped snapshot (without the preset folder) of the pane's current state. */
    snapshot() {
        const full = this.pane.exportState();
        return stripManagerChild(full, this.resolveManagerIndex());
    }
    // --- Internal persistence -----------------------------------------------
    loadStore() {
        const fallback = {
            version: 1,
            activeId: null,
            presets: [],
        };
        const loaded = this.storage.readJSON(PRESETS_KEY, fallback);
        // Defensive validation of the persisted shape.
        if (!loaded ||
            typeof loaded !== 'object' ||
            !Array.isArray(loaded.presets)) {
            return fallback;
        }
        return {
            version: 1,
            activeId: typeof loaded.activeId === 'string' ? loaded.activeId : null,
            presets: loaded.presets.filter((p) => this.isPresetShape(p)),
        };
    }
    persist() {
        this.storage.writeJSON(PRESETS_KEY, this.store);
    }
    isPresetShape(o) {
        return (!!o &&
            typeof o === 'object' &&
            typeof o['name'] === 'string' &&
            typeof o['state'] === 'object' &&
            o['state'] !== null);
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
            id: typeof o['id'] === 'string' ? o['id'] : generateId(),
            name: o['name'],
            createdAt: typeof o['createdAt'] === 'number' ? o['createdAt'] : now,
            updatedAt: typeof o['updatedAt'] === 'number' ? o['updatedAt'] : now,
            state: o['state'],
            // Imported presets are custom (user-owned), unless explicitly flagged.
            custom: o['custom'] === false ? false : true,
        };
    }
    /**
     * Adds an imported preset, handling id collisions.
     * @returns the final id (possibly regenerated).
     */
    addImportedPreset(preset) {
        // Colliding id -> regenerate a new one to avoid conflicts.
        if (this.store.presets.some((p) => p.id === preset.id)) {
            preset = { ...preset, id: generateId() };
        }
        this.store.presets.push(preset);
        return preset.id;
    }
}
//# sourceMappingURL=presets.js.map