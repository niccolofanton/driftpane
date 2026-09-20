// Optional height cap (maxHeight) + panel scroll.
//
// We apply the marker class and the CSS variable directly on pane.element
// (which is the root panel `.tp-rotv`). `--dp-max-height` (default
// `calc(100dvh - 48px)`) is the height TARGET of the WHOLE PANEL; the CSS rule
// in styles.ts caps, however, the CONTENT `.tp-rotv_c` to `--dp-max-height` minus
// the title-bar height (`--dp-titlebar`), and makes it scrollable when it
// overflows. This way the total height (title-bar + content) respects EXACTLY the
// requested value, and the resize handle — sibling of the panel — is not
// clipped. Capping the CONTENT (and not the root panel) is deliberate: the
// "dynamic island" fold animates the content height, so a cap on the root made
// it restart from a wrong point on closing; capping it here leaves the animation
// correct. For the same reason the rule is NOT gated on the expanded state.

import {PopupLayer} from './popups.js';

const popupLayers = new WeakMap<HTMLElement, PopupLayer>();

/** Marker class applied to the panel to activate the scroll CSS rule. */
const SCROLL_CLASS = 'driftpane-scroll';

/** Inline CSS variable that carries the cap value onto the panel. */
const MAX_HEIGHT_VAR = '--dp-max-height';

/** A finite CSS length/expression usable inside the viewport cap's min(). */
export function isMaxHeightValue(value: unknown): value is string {
	if (typeof value !== 'string' || !value.trim()) return false;
	const css = value.trim();
	if (
		/^(?:none|auto|initial|inherit|unset|revert|fit-content|max-content|min-content)$/i.test(
			css,
		)
	)
		return false;
	if (/^(?:NaN|[-+]?Infinity)/i.test(css)) return false;
	if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function') {
		return CSS.supports('max-height', `min(${css}, 100dvh)`);
	}
	// No CSS parser (SSR/test DOM): accept CSS lengths and math expressions.
	return (
		/^(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|[sld]?v[wh]|[sld]?vmin|[sld]?vmax|em|rem|ch|ex|lh|rlh|cm|mm|in|pt|pc)$/i.test(
			css,
		) || /^(?:calc|min|max|clamp|var)\(.+\)$/i.test(css)
	);
}

/**
 * Applies the height cap + scroll on the host (typically pane.element, i.e.
 * the root panel `.tp-rotv`). `value` is an already-formatted CSS length
 * (e.g. `'80vh'`, `'400px'`, `'calc(100dvh - 48px)'`): it adds the marker class
 * and sets the inline CSS variable. If `value` is not a non-empty string it is a
 * no-op (vh/px formatting is the caller's responsibility).
 */
export function applyMaxHeight(host: HTMLElement, value: string): void {
	if (!isMaxHeightValue(value)) {
		return;
	}
	host.classList.add(SCROLL_CLASS);
	host.style.setProperty(MAX_HEIGHT_VAR, value);
	if (!popupLayers.has(host)) {
		popupLayers.set(host, new PopupLayer(host));
	}
}

/** Removes the cap (cleanup/dispose): strips the marker class and the variable. */
export function clearMaxHeight(host: HTMLElement): void {
	popupLayers.get(host)?.dispose();
	popupLayers.delete(host);
	host.classList.remove(SCROLL_CLASS);
	host.style.removeProperty(MAX_HEIGHT_VAR);
}
