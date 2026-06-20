/**
 * Applies the height cap + scroll on the host (typically pane.element, i.e.
 * the root panel `.tp-rotv`). `value` is an already-formatted CSS length
 * (e.g. `'80vh'`, `'400px'`, `'calc(100dvh - 48px)'`): it adds the marker class
 * and sets the inline CSS variable. If `value` is not a non-empty string it is a
 * no-op (vh/px formatting is the caller's responsibility).
 */
export declare function applyMaxHeight(host: HTMLElement, value: string): void;
/** Removes the cap (cleanup/dispose): strips the marker class and the variable. */
export declare function clearMaxHeight(host: HTMLElement): void;
