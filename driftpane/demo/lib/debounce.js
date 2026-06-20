// Typed debounce utility, with no external dependencies.
// Trailing-edge strategy: the function is invoked only once, after `waitMs` have
// elapsed since the last call. Exposes `flush()` to force the immediate
// execution of a pending save (useful before unload) and `cancel()` to abort it.
/**
 * Creates a debounced (trailing-edge) version of `fn`.
 * @param fn Function to invoke at the end of the window.
 * @param waitMs Duration of the wait window in milliseconds.
 */
export function debounce(fn, waitMs) {
    let timer = null;
    // Keep the last arguments so we can use them in flush().
    let lastArgs = null;
    const debounced = ((...args) => {
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
    });
    debounced.flush = () => {
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
    debounced.cancel = () => {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        lastArgs = null;
    };
    return debounced;
}
//# sourceMappingURL=debounce.js.map