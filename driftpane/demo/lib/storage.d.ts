/**
 * Checks whether localStorage is actually usable.
 * Some browsers expose `localStorage` but throw on write
 * (e.g. Safari in private browsing), so we try a real round-trip.
 */
export declare function isStorageAvailable(): boolean;
/**
 * Namespaced, error-proof access to localStorage.
 * All keys are prefixed with `driftpane:<namespace>:`.
 */
export declare class DriftpaneStorage {
    private readonly namespace;
    private readonly available;
    constructor(namespace: string);
    /** Builds the full namespaced key for a given suffix. */
    keyFor(suffix: string): string;
    /**
     * Reads and deserializes a JSON value. Returns `fallback` if the key does not
     * exist, if the storage is unavailable, or if the JSON is malformed.
     */
    readJSON<T>(suffix: string, fallback: T): T;
    /**
     * Serializes and writes a JSON value. Silent no-op if the storage is
     * unavailable or if the write fails (e.g. quota exceeded).
     */
    writeJSON(suffix: string, value: unknown): void;
    /** Removes a key. No-op if the storage is unavailable. */
    remove(suffix: string): void;
}
