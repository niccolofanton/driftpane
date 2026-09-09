// Typed, defensive wrapper over localStorage.
// This is the ONLY point of the layer that directly touches the browser storage:
// key namespacing, JSON serialization, and graceful degradation (no-op) when
// the storage is unavailable (private mode, quota full, etc.).
/**
 * Checks whether localStorage is actually usable.
 * Some browsers expose `localStorage` but throw on write
 * (e.g. Safari in private browsing), so we try a real round-trip.
 */
export function isStorageAvailable() {
    try {
        if (typeof localStorage === 'undefined') {
            return false;
        }
        const probe = '__driftpane_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Namespaced, error-proof access to localStorage.
 * All keys are prefixed with `driftpane:<namespace>:`.
 */
export class DriftpaneStorage {
    constructor(namespace) {
        this.namespace = namespace;
        this.available = isStorageAvailable();
    }
    /** Builds the full namespaced key for a given suffix. */
    keyFor(suffix) {
        return `driftpane:${this.namespace}:${suffix}`;
    }
    /** The storage namespace (used e.g. to name full-backup export files). */
    getNamespace() {
        return this.namespace;
    }
    /**
     * Reads and deserializes a JSON value. Returns `fallback` if the key does not
     * exist, if the storage is unavailable, or if the JSON is malformed.
     */
    readJSON(suffix, fallback) {
        if (!this.available) {
            return fallback;
        }
        try {
            const raw = localStorage.getItem(this.keyFor(suffix));
            if (raw === null) {
                return fallback;
            }
            return JSON.parse(raw);
        }
        catch {
            // Corrupt JSON or read error: fall back to the default without crashing.
            return fallback;
        }
    }
    /**
     * Serializes and writes a JSON value. Silent no-op if the storage is
     * unavailable or if the write fails (e.g. quota exceeded).
     */
    writeJSON(suffix, value) {
        if (!this.available) {
            return;
        }
        try {
            localStorage.setItem(this.keyFor(suffix), JSON.stringify(value));
        }
        catch {
            // Ignore: persistence is best-effort and must never break the UI.
        }
    }
    /** Removes a key. No-op if the storage is unavailable. */
    remove(suffix) {
        if (!this.available) {
            return;
        }
        try {
            localStorage.removeItem(this.keyFor(suffix));
        }
        catch {
            // Ignore.
        }
    }
}
//# sourceMappingURL=storage.js.map