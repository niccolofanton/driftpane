// Typed debounce utility, with no external dependencies.
// Trailing-edge strategy: the function is invoked only once, after `waitMs` have
// elapsed since the last call. Exposes `flush()` to force the immediate
// execution of a pending save (useful before unload) and `cancel()` to abort it.

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
export function debounce<F extends (...args: never[]) => void>(
	fn: F,
	waitMs: number,
): Debounced<F> {
	let timer: ReturnType<typeof setTimeout> | null = null;
	// Keep the last arguments so we can use them in flush().
	let lastArgs: Parameters<F> | null = null;

	const debounced = ((...args: Parameters<F>): void => {
		lastArgs = args;
		if (timer !== null) {
			clearTimeout(timer);
		}
		timer = setTimeout(() => {
			timer = null;
			const callArgs = lastArgs;
			lastArgs = null;
			if (callArgs) {
				fn(...callArgs);
			}
		}, waitMs);
	}) as Debounced<F>;

	debounced.flush = (): void => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
			const callArgs = lastArgs;
			lastArgs = null;
			if (callArgs) {
				fn(...callArgs);
			}
		}
	};

	debounced.cancel = (): void => {
		if (timer !== null) {
			clearTimeout(timer);
			timer = null;
		}
		lastArgs = null;
	};

	return debounced;
}
