import { DriftpaneShareEnvelope, DriftpaneShareIdentity, SerializedState } from './types.js';
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
export type ShareReadResult = {
    kind: 'none';
} | {
    kind: 'ignore';
} | {
    kind: 'too-new';
} | {
    kind: 'envelope';
    env: DriftpaneShareEnvelope;
};
export declare class UrlShareController {
    private readonly pane;
    private readonly opts;
    private readonly debouncedWrite;
    private suspended;
    private disposed;
    private attached;
    /** Monotonic write token; async encodes that are no longer the latest are dropped. */
    private writeSeq;
    private warnedLong;
    private warnedTooNew;
    /**
     * JSON of the last snapshot we either saw or wrote. Used to DEDUPE change
     * events: readonly-monitor updates fire `change` ~every frame but leave the
     * (readonly-normalized) snapshot identical, so we must not let them reset the
     * trailing debounce — otherwise it would never settle and the URL would never
     * update during continuous monitor animation.
     */
    private lastSnapshot;
    /** Single root `change` listener: schedules a debounced URL write. */
    private readonly onChange;
    constructor(pane: SharePaneLike, opts: UrlShareOptions);
    /**
     * Attaches the root `change` listener. Call this AFTER the initial state
     * restore so programmatic restores do not arm lazy sync; the first real user
     * change is then the first thing to populate the URL.
     */
    attach(): void;
    /** JSON of the current snapshot, or null if it cannot be produced. */
    private snapshotJson;
    /** Pauses change-driven writes (used during the incoming-share preview). */
    suspend(): void;
    /** Resumes change-driven writes. */
    resume(): void;
    /** True if the current URL already carries our param (sync). */
    hasIncomingParam(): boolean;
    /**
     * Writes the current config to the URL via `replaceState` and returns the
     * resulting URL. Latest-wins: if a newer write starts during the async encode,
     * this one is dropped. No-op (returns the current href) when there is no
     * identity to stamp or no window.
     */
    writeNow(): Promise<string>;
    /**
     * Builds the share URL WITHOUT mutating the address bar (for `shareUrl()`).
     * Returns the current href if there is no identity to stamp.
     */
    buildUrl(): Promise<string>;
    /** Reads + decodes the incoming param, applying the defensive version rules. */
    readIncoming(): Promise<ShareReadResult>;
    /** Removes our param from the URL (the v1 "stop sharing"), preserving the rest. */
    clear(): void;
    /** Cancels pending writes and stops reacting to changes. */
    dispose(): void;
    private hasWindow;
    private currentHref;
    private readParam;
    /** Returns the current URL with our param set to `value` (other params/hash kept). */
    private urlWithParam;
    private replaceState;
    private maybeWarnLong;
    private warnTooNew;
}
/** Encodes an envelope to a URL-safe value: `c` (compressed) or `u` (raw) + base64url. */
export declare function encodeEnvelope(env: DriftpaneShareEnvelope): Promise<string>;
/** Decodes a value produced by {@link encodeEnvelope}. Throws on any failure. */
export declare function decodeEnvelope(value: string): Promise<unknown>;
