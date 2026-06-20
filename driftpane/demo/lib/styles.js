// CSS injected once for the draggable container.
// Keeps the container fixed at the top-left (the actual position is managed via
// inline style by DraggableController), sets a high z-index, the grab/grabbing
// cursor on the title-bar, and prevents text selection during the drag.
/** Identifying attribute of the injected <style> tag. */
const STYLE_MARKER = 'data-driftpane';
/** CSS string of the layer. */
export const DRIFTPANE_CSS = `
.driftpane-drag-container {
	position: fixed;
	top: 0;
	left: 0;
	z-index: 2147483000;
	box-sizing: border-box;
	/* The explicit width is set by the controller (inline): this way, when
	   collapsed, the title-bar does NOT shrink, and the right handle allows
	   resizing the width. */
}
.driftpane-drag-container > .tp-rotv {
	width: 100%;
	box-sizing: border-box;
}
.driftpane-drag-container .tp-rotv_b {
	cursor: move;
	-webkit-user-select: none;
	user-select: none;
	touch-action: none;
}
.driftpane-drag-container .tp-rotv_b:active {
	cursor: move;
}
.driftpane-resize-handle {
	position: absolute;
	top: 0;
	right: -3px;
	width: 8px;
	height: 100%;
	cursor: ew-resize;
	touch-action: none;
	z-index: 1;
}
/* HEIGHT resize handle (bottom edge): dragging it updates the panel max-height.
   It lives in the container (sibling of .tp-rotv), so it does not scroll with
   the content and is not clipped by the panel overflow. */
.driftpane-resize-handle-y {
	position: absolute;
	left: 0;
	bottom: -3px;
	width: 100%;
	height: 8px;
	cursor: ns-resize;
	touch-action: none;
	z-index: 2;
}
/* CORNER handle (bottom-right): simultaneous width+height resize, like in a
   normal app. It sits above the edge handles in the corner (higher z-index). */
.driftpane-resize-handle-corner {
	position: absolute;
	right: -3px;
	bottom: -3px;
	width: 16px;
	height: 16px;
	cursor: nwse-resize;
	touch-action: none;
	z-index: 3;
}
/* maxHeight: height cap + scroll. We cap the CONTENT (.tp-rotv_c), NOT the root
   panel: this way the "dynamic island" fold animation always starts from the
   VISIBLE (capped) height even after a resize. If we capped .tp-rotv, on collapse
   the cap would disappear and .tp-rotv_c would reveal its full height, making the
   animation "jump".
   --dp-max-height = target height of the PANEL (default 100dvh minus 48px, a 24px
   safe zone top/bottom; overridable with maxHeightVh / setMaxHeight / resize). We
   subtract the title-bar (--dp-titlebar, default 24px) so the total panel (bar +
   content) respects exactly the target height.
   No gate on .tp-rotv-expanded: the cap stays for the whole transition, so the
   close starts from the capped height. Double selector: the marker class sits on
   pane.element (usually it IS the .tp-rotv; otherwise it is a wrapper). */
.tp-rotv.driftpane-scroll > .tp-rotv_c,
.driftpane-scroll .tp-rotv > .tp-rotv_c {
	max-height: calc(
		var(--dp-max-height, calc(100dvh - 48px)) - var(--dp-titlebar, 24px)
	);
	overflow-y: auto;
	/* Sober/neutral scrollbar (Firefox): semi-transparent, fine on light and dark. */
	scrollbar-width: thin;
	scrollbar-color: rgba(128, 128, 128, 0.4) transparent;
}
/* Sober/neutral scrollbar (WebKit/Blink). */
.tp-rotv.driftpane-scroll > .tp-rotv_c::-webkit-scrollbar,
.driftpane-scroll .tp-rotv > .tp-rotv_c::-webkit-scrollbar {
	width: 8px;
	height: 8px;
}
.tp-rotv.driftpane-scroll > .tp-rotv_c::-webkit-scrollbar-track,
.driftpane-scroll .tp-rotv > .tp-rotv_c::-webkit-scrollbar-track {
	background: transparent;
}
.tp-rotv.driftpane-scroll > .tp-rotv_c::-webkit-scrollbar-thumb,
.driftpane-scroll .tp-rotv > .tp-rotv_c::-webkit-scrollbar-thumb {
	background-color: rgba(128, 128, 128, 0.4);
	border-radius: 4px;
}
.tp-rotv.driftpane-scroll > .tp-rotv_c::-webkit-scrollbar-thumb:hover,
.driftpane-scroll .tp-rotv > .tp-rotv_c::-webkit-scrollbar-thumb:hover {
	background-color: rgba(128, 128, 128, 0.6);
}

/* === Preset menu: small icons on the buttons + Export|Import row ========= */
/* Icon before the button text (monochrome SVG mask -> currentColor). The
   --dp-btn-icon variable is set per-button below. */
.dp-btn-icon .tp-btnv_b {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
}
.dp-btn-icon .tp-btnv_b::before {
	content: '';
	flex: 0 0 auto;
	width: 13px;
	height: 13px;
	background-color: currentColor;
	opacity: 0.9;
	-webkit-mask: var(--dp-btn-icon) center / contain no-repeat;
	mask: var(--dp-btn-icon) center / contain no-repeat;
}
.dp-btn-save {
	--dp-btn-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z'/%3E%3Cpath d='M17 21v-8H7v8'/%3E%3Cpath d='M7 3v5h8'/%3E%3C/svg%3E");
}
.dp-btn-new {
	--dp-btn-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 5v14'/%3E%3Cpath d='M5 12h14'/%3E%3C/svg%3E");
}
.dp-btn-rename {
	--dp-btn-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 20h9'/%3E%3Cpath d='M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z'/%3E%3C/svg%3E");
}
.dp-btn-export {
	--dp-btn-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/%3E%3Cpath d='M7 10l5 5 5-5'/%3E%3Cpath d='M12 15V3'/%3E%3C/svg%3E");
}
.dp-btn-import {
	--dp-btn-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/%3E%3Cpath d='M17 8l-5-5-5 5'/%3E%3Cpath d='M12 3v12'/%3E%3C/svg%3E");
}
.dp-btn-reset {
	--dp-btn-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M12 2v4'/%3E%3Cpath d='M12 18v4'/%3E%3Cpath d='M2 12h4'/%3E%3Cpath d='M18 12h4'/%3E%3C/svg%3E");
}
.dp-btn-revert {
	--dp-btn-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 14L4 9l5-5'/%3E%3Cpath d='M4 9h11a4 4 0 0 1 0 8h-1'/%3E%3C/svg%3E");
}
.dp-btn-delete {
	--dp-btn-icon: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6h18'/%3E%3Cpath d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/%3E%3Cpath d='M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6'/%3E%3Cpath d='M10 11v6'/%3E%3Cpath d='M14 11v6'/%3E%3C/svg%3E");
}
/* === "button row" system: N buttons on a single line, even width ===========
   Tweakpane button blades are .tp-lblv wrappers (labeled, "no label"): we put
   the blades inside .dp-btn-row (flex) and make them split the row into equal
   parts with > * { flex: 1 }. Works for 2..N buttons (Export|Import, but
   reusable). We zero out the blade margins (the row handles them). */
.dp-btn-row {
	display: flex;
	gap: 4px;
	margin-top: 4px;
	/* Horizontal inset = inner padding of a blade (4px), so the buttons in the
	   row align with the full-width ones above/below. */
	padding: 0 4px;
}
.dp-btn-row > * {
	flex: 1 1 0;
	min-width: 0;
	margin: 0;
	/* Zero out the blade inner padding: the button fills the blade, so the
	   VISIBLE gap between the two buttons = the row gap (4px) = vertical gap. */
	padding: 0;
}
`.trim();
/**
 * Injects the layer CSS into the document, only once (idempotent).
 * @param doc The document in which to inject the <style>.
 */
export function injectStyles(doc) {
    if (doc.querySelector(`style[${STYLE_MARKER}]`)) {
        return;
    }
    const style = doc.createElement('style');
    style.setAttribute(STYLE_MARKER, '');
    style.textContent = DRIFTPANE_CSS;
    doc.head.appendChild(style);
}
//# sourceMappingURL=styles.js.map