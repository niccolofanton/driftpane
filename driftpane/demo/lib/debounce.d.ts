/**
 * A "debounced" function with extra controls.
 * @template F Signature of the original function.
 */
export interface Debounced<F extends (...args: never[]) => void> {
    (...args: Parameters<F>): void;
    /** Runs the pending call immediately (if any) and resets the timer. */
    flush(): void;
    /** Cancels the pending call without executing it. */
    cancel(): void;
}
/**
 * Creates a debounced (trailing-edge) version of `fn`.
 * @param fn Function to invoke at the end of the window.
 * @param waitMs Duration of the wait window in milliseconds.
 */
export declare function debounce<F extends (...args: never[]) => void>(fn: F, waitMs: number): Debounced<F>;
