// URL config sharing.
//
// A new sharing channel, layered next to localStorage persistence: the active
// config travels in a namespaced query param (`<paramKey>`, e.g. `dp:default`),
// live-synced via `history.replaceState`. The payload is a versioned envelope
// (see DriftpaneShareEnvelope) carrying a preset identity + scoped values.
//
// This controller owns ONLY the URL I/O: encode/decode (native CompressionStream
// with an uncompressed fallback, base64url), reading/writing the param while
// preserving the rest of the host URL, lazy + latest-wins writes, and
// suspend/resume. Reconciliation (import/overwrite) and the preview live in the
// facade + PresetController; this layer knows nothing about presets.

import {debounce, Debounced} from './debounce.js';
import {
	DriftpaneShareEnvelope,
	DriftpaneShareIdentity,
	SerializedState,
} from './types.js';

/** Format tag of the share envelope. */
const FORMAT = 'driftpane-share';

/** Highest envelope version this build can read. */
const SUPPORTED_VERSION = 1;

/**
 * Soft length threshold (chars of the encoded param value). Beyond it we warn
 * once and still write: some chat tools truncate long links, but truncating the
 * value ourselves would corrupt the payload.
 */
const URL_LENGTH_THRESHOLD = 2000;

/** Minimal Pane API used by the controller: only the root `change` event. */
export interface SharePaneLike {
	on(ev: 'change', handler: (e: unknown) => void): unknown;
}

export interface UrlShareOptions {
	/** Full namespaced query-param key, e.g. `dp:default`. */
	paramKey: string;
	/** Debounce window (ms) for live writes. */
	debounceMs: number;
	/** Returns the current scoped (values-only) snapshot to encode. */
	getSnapshot: () => SerializedState;
	/** Returns the active preset identity, or null when there is none. */
	getIdentity: () => DriftpaneShareIdentity | null;
}

/** Result of reading an incoming link. */
export type ShareReadResult =
	| {kind: 'none'}
	| {kind: 'ignore'}
	| {kind: 'too-new'}
	| {kind: 'envelope'; env: DriftpaneShareEnvelope};

export class UrlShareController {
	private readonly pane: SharePaneLike;
	private readonly opts: UrlShareOptions;
	private readonly debouncedWrite: Debounced<() => void>;

	private suspended = false;
	private disposed = false;
	private attached = false;
	/** Monotonic write token; async encodes that are no longer the latest are dropped. */
	private writeSeq = 0;
	private warnedLong = false;
	private warnedTooNew = false;
	/**
	 * JSON of the last snapshot we either saw or wrote. Used to DEDUPE change
	 * events: readonly-monitor updates fire `change` ~every frame but leave the
	 * (readonly-normalized) snapshot identical, so we must not let them reset the
	 * trailing debounce — otherwise it would never settle and the URL would never
	 * update during continuous monitor animation.
	 */
	private lastSnapshot: string | null = null;

	/** Single root `change` listener: schedules a debounced URL write. */
	private readonly onChange = (): void => {
		if (this.disposed || this.suspended) {
			return;
		}
		const snap = this.snapshotJson();
		if (snap === null || snap === this.lastSnapshot) {
			// No real change (e.g. readonly-monitor noise): don't reset the debounce.
			return;
		}
		this.lastSnapshot = snap;
		this.debouncedWrite();
	};

	constructor(pane: SharePaneLike, opts: UrlShareOptions) {
		this.pane = pane;
		this.opts = opts;
		this.debouncedWrite = debounce(() => {
			void this.writeNow();
		}, opts.debounceMs);
	}

	/**
	 * Attaches the root `change` listener. Call this AFTER the initial state
	 * restore so programmatic restores do not arm lazy sync; the first real user
	 * change is then the first thing to populate the URL.
	 */
	public attach(): void {
		if (this.attached) {
			return;
		}
		this.attached = true;
		// Baseline the snapshot so monitor noise / the restored initial state does
		// not arm lazy sync: the first REAL change is the first thing to write.
		this.lastSnapshot = this.snapshotJson();
		this.pane.on('change', this.onChange);
	}

	/** JSON of the current snapshot, or null if it cannot be produced. */
	private snapshotJson(): string | null {
		try {
			return JSON.stringify(this.opts.getSnapshot());
		} catch {
			return null;
		}
	}

	/** Pauses change-driven writes (used during the incoming-share preview). */
	public suspend(): void {
		this.suspended = true;
		this.debouncedWrite.cancel();
	}

	/** Resumes change-driven writes. */
	public resume(): void {
		this.suspended = false;
	}

	/** True if the current URL already carries our param (sync). */
	public hasIncomingParam(): boolean {
		return this.readParam() !== null;
	}

	/**
	 * Writes the current config to the URL via `replaceState` and returns the
	 * resulting URL. Latest-wins: if a newer write starts during the async encode,
	 * this one is dropped. No-op (returns the current href) when there is no
	 * identity to stamp or no window.
	 */
	public async writeNow(): Promise<string> {
		const identity = this.opts.getIdentity();
		if (!identity || !this.hasWindow()) {
			return this.currentHref();
		}
		const snapshot = this.opts.getSnapshot();
		const env = buildEnvelope(snapshot, identity);
		const seq = ++this.writeSeq;
		const value = await encodeEnvelope(env);
		if (seq !== this.writeSeq || this.disposed) {
			// Superseded by a newer write (or disposed): drop this result.
			return this.currentHref();
		}
		this.maybeWarnLong(value);
		const url = this.urlWithParam(value);
		this.replaceState(url);
		this.lastSnapshot = JSON.stringify(snapshot);
		return url;
	}

	/**
	 * Builds the share URL WITHOUT mutating the address bar (for `shareUrl()`).
	 * Returns the current href if there is no identity to stamp.
	 */
	public async buildUrl(): Promise<string> {
		const identity = this.opts.getIdentity();
		if (!identity || !this.hasWindow()) {
			return this.currentHref();
		}
		const env = buildEnvelope(this.opts.getSnapshot(), identity);
		const value = await encodeEnvelope(env);
		return this.urlWithParam(value);
	}

	/** Reads + decodes the incoming param, applying the defensive version rules. */
	public async readIncoming(): Promise<ShareReadResult> {
		const value = this.readParam();
		if (!value) {
			return {kind: 'none'};
		}
		let parsed: unknown;
		try {
			parsed = await decodeEnvelope(value);
		} catch {
			return {kind: 'ignore'};
		}
		if (!parsed || typeof parsed !== 'object') {
			return {kind: 'ignore'};
		}
		const o = parsed as Record<string, unknown>;
		if (o['f'] !== FORMAT) {
			return {kind: 'ignore'};
		}
		const state = o['s'];
		if (!state || typeof state !== 'object') {
			return {kind: 'ignore'};
		}
		const v = o['v'];
		if (typeof v !== 'number') {
			return {kind: 'ignore'};
		}
		if (v > SUPPORTED_VERSION) {
			this.warnTooNew();
			return {kind: 'too-new'};
		}
		const env: DriftpaneShareEnvelope = {
			f: FORMAT,
			v,
			n: typeof o['n'] === 'string' ? (o['n'] as string) : 'Preset',
			d: o['d'] === true,
			s: state as SerializedState,
		};
		if (typeof o['id'] === 'string') {
			env.id = o['id'] as string;
		}
		return {kind: 'envelope', env};
	}

	/** Removes our param from the URL (the v1 "stop sharing"), preserving the rest. */
	public clear(): void {
		if (!this.hasWindow()) {
			return;
		}
		const url = new URL(window.location.href);
		url.searchParams.delete(this.opts.paramKey);
		this.replaceState(url.toString());
	}

	/** Cancels pending writes and stops reacting to changes. */
	public dispose(): void {
		this.disposed = true;
		this.debouncedWrite.cancel();
	}

	// --- URL plumbing -------------------------------------------------------

	private hasWindow(): boolean {
		return (
			typeof window !== 'undefined' &&
			typeof window.history !== 'undefined' &&
			typeof window.location !== 'undefined'
		);
	}

	private currentHref(): string {
		return this.hasWindow() ? window.location.href : '';
	}

	private readParam(): string | null {
		if (!this.hasWindow()) {
			return null;
		}
		return new URLSearchParams(window.location.search).get(this.opts.paramKey);
	}

	/** Returns the current URL with our param set to `value` (other params/hash kept). */
	private urlWithParam(value: string): string {
		const url = new URL(window.location.href);
		url.searchParams.set(this.opts.paramKey, value);
		return url.toString();
	}

	private replaceState(url: string): void {
		window.history.replaceState(window.history.state, '', url);
	}

	private maybeWarnLong(value: string): void {
		if (value.length > URL_LENGTH_THRESHOLD && !this.warnedLong) {
			this.warnedLong = true;
			if (typeof console !== 'undefined') {
				console.warn(
					`[Driftpane] Share URL is large (${value.length} chars); some tools may truncate it.`,
				);
			}
		}
	}

	private warnTooNew(): void {
		if (this.warnedTooNew) {
			return;
		}
		this.warnedTooNew = true;
		if (typeof console !== 'undefined') {
			console.warn(
				'[Driftpane] This link was created with a newer version of driftpane — update to open it.',
			);
		}
	}
}

// --- Envelope + codec (module-level, pure) ---------------------------------

/** Builds the envelope from a snapshot + identity. */
function buildEnvelope(
	snapshot: SerializedState,
	identity: DriftpaneShareIdentity,
): DriftpaneShareEnvelope {
	const env: DriftpaneShareEnvelope = {
		f: FORMAT,
		v: SUPPORTED_VERSION,
		n: identity.name,
		d: identity.isDefault,
		s: snapshot,
	};
	if (!identity.isDefault && typeof identity.id === 'string') {
		env.id = identity.id;
	}
	return env;
}

/** Whether native (de)compression is available in this environment. */
function supportsCompression(): boolean {
	return (
		typeof CompressionStream !== 'undefined' &&
		typeof DecompressionStream !== 'undefined'
	);
}

/** Encodes an envelope to a URL-safe value: `c` (compressed) or `u` (raw) + base64url. */
export async function encodeEnvelope(
	env: DriftpaneShareEnvelope,
): Promise<string> {
	const utf8 = new TextEncoder().encode(JSON.stringify(env));
	if (supportsCompression()) {
		try {
			const deflated = await runStream(utf8, new CompressionStream('deflate'));
			return `c${toBase64Url(deflated)}`;
		} catch {
			// Fall through to the uncompressed encoding.
		}
	}
	return `u${toBase64Url(utf8)}`;
}

/** Decodes a value produced by {@link encodeEnvelope}. Throws on any failure. */
export async function decodeEnvelope(value: string): Promise<unknown> {
	if (value.length < 1) {
		throw new Error('empty value');
	}
	const tag = value[0];
	const bytes = fromBase64Url(value.slice(1));
	let json: string;
	if (tag === 'c') {
		if (!supportsCompression()) {
			throw new Error('decompression unavailable');
		}
		const inflated = await runStream(bytes, new DecompressionStream('deflate'));
		json = new TextDecoder().decode(inflated);
	} else if (tag === 'u') {
		json = new TextDecoder().decode(bytes);
	} else {
		throw new Error('unknown codec');
	}
	return JSON.parse(json);
}

/** Pushes `bytes` through a (de)compression transform and collects the output. */
async function runStream(
	bytes: Uint8Array,
	transform: {readable: ReadableStream; writable: WritableStream},
): Promise<Uint8Array> {
	const writer = transform.writable.getWriter();
	const writeDone = writer.write(bytes).then(() => writer.close());
	const reader = transform.readable.getReader();
	const chunks: Uint8Array[] = [];
	for (;;) {
		const {done, value} = await reader.read();
		if (done) {
			break;
		}
		if (value) {
			chunks.push(value as Uint8Array);
		}
	}
	await writeDone;
	let total = 0;
	for (const chunk of chunks) {
		total += chunk.length;
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.length;
	}
	return out;
}

/** Bytes -> base64url (no padding). */
function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary)
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

/** base64url -> bytes. */
function fromBase64Url(value: string): Uint8Array {
	const padding =
		value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4));
	const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + padding;
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}
