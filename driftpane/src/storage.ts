// Typed, defensive wrapper over localStorage.
// This is the ONLY point of the layer that directly touches the browser storage:
// key namespacing, JSON serialization, and graceful degradation (no-op) when
// the storage is unavailable (private mode, quota full, etc.).

/**
 * Checks whether localStorage is actually usable.
 * Some browsers expose `localStorage` but throw on write
 * (e.g. Safari in private browsing), so we try a real round-trip.
 */
export function isStorageAvailable(): boolean {
	try {
		if (typeof localStorage === 'undefined') {
			return false;
		}
		const probe = '__driftpane_probe__';
		localStorage.setItem(probe, '1');
		localStorage.removeItem(probe);
		return true;
	} catch {
		return false;
	}
}

/**
 * Namespaced, error-proof access to localStorage.
 * All keys are prefixed with `driftpane:<namespace>:`.
 */
export class DriftpaneStorage {
	private readonly namespace: string;
	private readonly available: boolean;

	constructor(namespace: string) {
		this.namespace = namespace;
		this.available = isStorageAvailable();
	}

	/** Builds the full namespaced key for a given suffix. */
	public keyFor(suffix: string): string {
		return `driftpane:${this.namespace}:${suffix}`;
	}

	/**
	 * Reads and deserializes a JSON value. Returns `fallback` if the key does not
	 * exist, if the storage is unavailable, or if the JSON is malformed.
	 */
	public readJSON<T>(suffix: string, fallback: T): T {
		if (!this.available) {
			return fallback;
		}
		try {
			const raw = localStorage.getItem(this.keyFor(suffix));
			if (raw === null) {
				return fallback;
			}
			return JSON.parse(raw) as T;
		} catch {
			// Corrupt JSON or read error: fall back to the default without crashing.
			return fallback;
		}
	}

	/**
	 * Serializes and writes a JSON value. Silent no-op if the storage is
	 * unavailable or if the write fails (e.g. quota exceeded).
	 */
	public writeJSON(suffix: string, value: unknown): void {
		if (!this.available) {
			return;
		}
		try {
			localStorage.setItem(this.keyFor(suffix), JSON.stringify(value));
		} catch {
			// Ignore: persistence is best-effort and must never break the UI.
		}
	}

	/** Removes a key. No-op if the storage is unavailable. */
	public remove(suffix: string): void {
		if (!this.available) {
			return;
		}
		try {
			localStorage.removeItem(this.keyFor(suffix));
		} catch {
			// Ignore.
		}
	}
}
