// Feature 2: persistent draggable panel.
//
// We wrap `pane.element` in a `position:fixed` container and implement dragging
// from the pane title-bar using Pointer Events (mouse + touch). A movement
// threshold distinguishes a click (fold toggle) from a drag (which must NOT
// toggle the fold). The position is clamped to the viewport edges and persisted
// in a localStorage key SEPARATE from the pane state.

import {applyMaxHeight} from './scroll.js';
import {DriftpaneStorage} from './storage.js';
import {DriftpanePosition} from './types.js';

/**
 * Selector of the root pane title-bar used as the drag handle.
 * Verified in the core: the root pane uses viewName 'rot' and the title button is
 * `ClassName('rot')('b')` => '.tp-rotv_b'.
 */
export const DRAG_HANDLE_SELECTOR = '.tp-rotv_b';

/** localStorage key suffix for the position. */
const POSITION_KEY = 'position';

/** localStorage key suffix for the pane width. */
const WIDTH_KEY = 'width';

/** localStorage key suffix for the max-height (px) set via resize. */
const MAXHEIGHT_KEY = 'maxHeight';

/** Threshold in px above which a gesture is considered a drag (not a click/fold). */
const DRAG_THRESHOLD_PX = 4;

/** Default width and resize limits (px). */
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 600;

/** Minimum panel height during vertical resize (px). */
const MIN_HEIGHT = 120;

/** Minimal pane API required by the drag. */
export interface PaneLike {
	element: HTMLElement;
}

export interface DraggableOptions {
	clampToViewport: boolean;
	/** Default position on first launch (no saved position). */
	defaultPosition: DriftpanePosition;
	/** Initial width (px) when there is no persisted width. */
	width?: number;
	/** Whether to create the width resize handle (right edge). Default: true. */
	resizableWidth?: boolean;
	/** Whether to create the height resize handle (bottom edge). Default: true. */
	resizableHeight?: boolean;
}

export class DraggableController {
	private readonly pane: PaneLike;
	private readonly storage: DriftpaneStorage;
	private readonly clampEnabled: boolean;
	private readonly defaultPosition: DriftpanePosition;
	private readonly resizableWidth: boolean;
	private readonly resizableHeight: boolean;

	private container: HTMLElement | null = null;
	private handle: HTMLElement | null = null;
	private resizeHandle: HTMLElement | null = null;
	private resizeHandleY: HTMLElement | null = null;
	private resizeHandleCorner: HTMLElement | null = null;
	private position: DriftpanePosition;
	private width: number;

	// State of the WIDTH resize gesture (independent of the drag).
	private resizing = false;
	private activeResizePointerId: number | null = null;
	private startResizeX = 0;
	private startWidth = 0;

	// State of the HEIGHT resize gesture (updates the max-height).
	private resizingHeight = false;
	private activeHeightPointerId: number | null = null;
	private startResizeY = 0;
	private startHeight = 0;
	private currentHeightPx = 0;

	// State of the CORNER resize gesture (width + height together).
	private resizingCorner = false;
	private activeCornerPointerId: number | null = null;
	private startCornerX = 0;
	private startCornerY = 0;
	private startCornerWidth = 0;
	private startCornerHeight = 0;

	private enabled = false;
	private dragging = false;
	private moved = false;
	private activePointerId: number | null = null;
	// Offset between the pointer and the container corner at drag start.
	private grabOffsetX = 0;
	private grabOffsetY = 0;
	private startPointerX = 0;
	private startPointerY = 0;

	// Handler references for cleanup.
	private readonly onPointerDown: (e: PointerEvent) => void;
	private readonly onPointerMove: (e: PointerEvent) => void;
	private readonly onPointerUp: (e: PointerEvent) => void;
	private readonly onClickCapture: (e: MouseEvent) => void;
	private readonly onResize: () => void;
	private readonly onResizeDown: (e: PointerEvent) => void;
	private readonly onResizeMove: (e: PointerEvent) => void;
	private readonly onResizeUp: (e: PointerEvent) => void;
	private readonly onHeightResizeDown: (e: PointerEvent) => void;
	private readonly onHeightResizeMove: (e: PointerEvent) => void;
	private readonly onHeightResizeUp: (e: PointerEvent) => void;
	private readonly onCornerResizeDown: (e: PointerEvent) => void;
	private readonly onCornerResizeMove: (e: PointerEvent) => void;
	private readonly onCornerResizeUp: (e: PointerEvent) => void;

	constructor(
		pane: PaneLike,
		storage: DriftpaneStorage,
		opts: DraggableOptions,
	) {
		this.pane = pane;
		this.storage = storage;
		this.clampEnabled = opts.clampToViewport;
		this.defaultPosition = opts.defaultPosition;
		this.resizableWidth = opts.resizableWidth ?? true;
		this.resizableHeight = opts.resizableHeight ?? true;

		// Initial position: from storage if present, otherwise the default.
		this.position = this.storage.readJSON<DriftpanePosition>(
			POSITION_KEY,
			this.defaultPosition,
		);

		// Initial width: from storage if valid, otherwise the "sensible size".
		const fallbackWidth =
			typeof opts.width === 'number' && isFinite(opts.width)
				? opts.width
				: DEFAULT_WIDTH;
		const savedWidth = this.storage.readJSON<number>(WIDTH_KEY, fallbackWidth);
		this.width = this.clampWidth(
			typeof savedWidth === 'number' && isFinite(savedWidth)
				? savedWidth
				: fallbackWidth,
		);

		this.onPointerDown = (e) => this.handlePointerDown(e);
		this.onPointerMove = (e) => this.handlePointerMove(e);
		this.onPointerUp = (e) => this.handlePointerUp(e);
		this.onClickCapture = (e) => this.handleClickCapture(e);
		this.onResize = () => this.handleResize();
		this.onResizeDown = (e) => this.handleResizeDown(e);
		this.onResizeMove = (e) => this.handleResizeMove(e);
		this.onResizeUp = (e) => this.handleResizeUp(e);
		this.onHeightResizeDown = (e) => this.handleHeightResizeDown(e);
		this.onHeightResizeMove = (e) => this.handleHeightResizeMove(e);
		this.onHeightResizeUp = (e) => this.handleHeightResizeUp(e);
		this.onCornerResizeDown = (e) => this.handleCornerResizeDown(e);
		this.onCornerResizeMove = (e) => this.handleCornerResizeMove(e);
		this.onCornerResizeUp = (e) => this.handleCornerResizeUp(e);
	}

	/**
	 * Enables the drag: creates the fixed container around pane.element and wires
	 * up the event listeners. Idempotent.
	 */
	public enable(): void {
		if (this.enabled) {
			return;
		}
		const paneElem = this.pane.element;
		const doc = paneElem.ownerDocument;

		// Build the fixed container and move pane.element into it.
		const container = doc.createElement('div');
		container.className = 'driftpane-drag-container';
		container.style.position = 'fixed';
		container.style.left = '0px';
		container.style.top = '0px';
		container.style.margin = '0';

		const parent = paneElem.parentElement;
		if (parent) {
			parent.insertBefore(container, paneElem);
		} else {
			doc.body.appendChild(container);
		}
		container.appendChild(paneElem);
		this.container = container;

		// Explicit width: when collapsed the title-bar does NOT shrink.
		container.style.width = `${this.width}px`;

		// Resize handle on the right edge (width) — only if enabled.
		if (this.resizableWidth) {
			const resizeHandle = doc.createElement('div');
			resizeHandle.className = 'driftpane-resize-handle';
			resizeHandle.addEventListener('pointerdown', this.onResizeDown);
			container.appendChild(resizeHandle);
			this.resizeHandle = resizeHandle;
		}

		// Resize handle on the bottom edge (height -> max-height) — only if
		// enabled. Dragging it sets the max-height in px (persisted).
		if (this.resizableHeight) {
			const resizeHandleY = doc.createElement('div');
			resizeHandleY.className = 'driftpane-resize-handle-y';
			resizeHandleY.addEventListener('pointerdown', this.onHeightResizeDown);
			container.appendChild(resizeHandleY);
			this.resizeHandleY = resizeHandleY;
		}

		// CORNER handle (bottom-right): simultaneous width and height resize like in
		// a normal app. Present only if both axes are enabled.
		if (this.resizableWidth && this.resizableHeight) {
			const resizeHandleCorner = doc.createElement('div');
			resizeHandleCorner.className = 'driftpane-resize-handle-corner';
			resizeHandleCorner.addEventListener(
				'pointerdown',
				this.onCornerResizeDown,
			);
			container.appendChild(resizeHandleCorner);
			this.resizeHandleCorner = resizeHandleCorner;
		}

		// The pane title-bar becomes the handle.
		this.handle = container.querySelector<HTMLElement>(DRAG_HANDLE_SELECTOR);

		// Apply the initial position (clamped).
		this.applyPosition();

		if (this.handle) {
			this.handle.style.cursor = 'move';
			this.handle.style.touchAction = 'none';
			this.handle.addEventListener('pointerdown', this.onPointerDown);
			// During the capture phase we intercept the click that follows a drag, to
			// prevent the fold toggle when the user has dragged.
			this.handle.addEventListener('click', this.onClickCapture, true);
		}

		if (typeof window !== 'undefined') {
			window.addEventListener('resize', this.onResize);
		}

		this.enabled = true;
	}

	/** Disables the drag by removing the listeners (keeps the container). */
	public disable(): void {
		if (!this.enabled) {
			return;
		}
		if (this.handle) {
			this.handle.removeEventListener('pointerdown', this.onPointerDown);
			this.handle.removeEventListener('click', this.onClickCapture, true);
			this.handle.style.cursor = '';
		}
		if (this.resizeHandle) {
			this.resizeHandle.removeEventListener('pointerdown', this.onResizeDown);
		}
		if (this.resizeHandleY) {
			this.resizeHandleY.removeEventListener(
				'pointerdown',
				this.onHeightResizeDown,
			);
		}
		if (this.resizeHandleCorner) {
			this.resizeHandleCorner.removeEventListener(
				'pointerdown',
				this.onCornerResizeDown,
			);
		}
		if (typeof window !== 'undefined') {
			window.removeEventListener('resize', this.onResize);
		}
		this.detachMoveListeners();
		this.detachResizeListeners();
		this.detachHeightResizeListeners();
		this.detachCornerResizeListeners();
		this.enabled = false;
	}

	/** Sets a new position (clamped) and persists it. */
	public setPosition(p: DriftpanePosition): void {
		this.position = {x: p.x, y: p.y};
		this.applyPosition();
		this.savePosition();
	}

	/** Returns the current position (copy). */
	public getPosition(): DriftpanePosition {
		return {x: this.position.x, y: this.position.y};
	}

	/** Returns the panel to the default position. */
	public resetPosition(): void {
		this.setPosition(this.defaultPosition);
	}

	/** Tears everything down: removes the listeners (the container stays in the DOM). */
	public dispose(): void {
		this.disable();
	}

	// --- Gesture handling ---------------------------------------------------

	private handlePointerDown(e: PointerEvent): void {
		// Primary button only for the mouse; touch/pen always ok.
		if (e.pointerType === 'mouse' && e.button !== 0) {
			return;
		}
		if (!this.container) {
			return;
		}
		this.dragging = true;
		this.moved = false;
		this.activePointerId = e.pointerId;
		this.startPointerX = e.clientX;
		this.startPointerY = e.clientY;

		const rect = this.container.getBoundingClientRect();
		this.grabOffsetX = e.clientX - rect.left;
		this.grabOffsetY = e.clientY - rect.top;

		// Capture the pointer so we track movement even outside the handle.
		try {
			this.handle?.setPointerCapture(e.pointerId);
		} catch {
			// Some environments may throw: not critical.
		}

		// Listen for move/up on the handle (pointer capture routes them there).
		this.handle?.addEventListener('pointermove', this.onPointerMove);
		this.handle?.addEventListener('pointerup', this.onPointerUp);
		this.handle?.addEventListener('pointercancel', this.onPointerUp);

		if (this.handle) {
			this.handle.style.cursor = 'move';
		}
	}

	private handlePointerMove(e: PointerEvent): void {
		if (!this.dragging || e.pointerId !== this.activePointerId) {
			return;
		}
		const dx = e.clientX - this.startPointerX;
		const dy = e.clientY - this.startPointerY;
		if (!this.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
			// Below threshold: not a drag yet, let it through for the fold.
			return;
		}
		this.moved = true;

		// New position = pointer minus the grab offset.
		const nextX = e.clientX - this.grabOffsetX;
		const nextY = e.clientY - this.grabOffsetY;
		this.position = this.clamp({x: nextX, y: nextY});
		this.applyPosition();

		// Prevent text selection / scroll during the drag.
		e.preventDefault();
	}

	private handlePointerUp(e: PointerEvent): void {
		if (e.pointerId !== this.activePointerId) {
			return;
		}
		this.dragging = false;
		this.activePointerId = null;
		this.detachMoveListeners();
		try {
			this.handle?.releasePointerCapture(e.pointerId);
		} catch {
			// Ignore.
		}
		if (this.handle) {
			this.handle.style.cursor = 'move';
		}
		if (this.moved) {
			// Persist the position only at the end of an actual drag.
			this.savePosition();
		}
		// Note: `moved` stays true until the capture click, which consumes it.
	}

	private handleClickCapture(e: MouseEvent): void {
		// If the user dragged, we suppress the click that would otherwise
		// toggle the pane fold. A "pure" click (moved=false) passes through.
		if (this.moved) {
			e.stopPropagation();
			e.preventDefault();
			this.moved = false;
		}
	}

	private handleResize(): void {
		// Re-clamp to stay within the viewport after a resize.
		this.position = this.clamp(this.position);
		this.applyPosition();
		this.savePosition();
	}

	// --- Width resize handling ----------------------------------------------

	private handleResizeDown(e: PointerEvent): void {
		if (e.pointerType === 'mouse' && e.button !== 0) {
			return;
		}
		if (!this.container) {
			return;
		}
		this.resizing = true;
		this.activeResizePointerId = e.pointerId;
		this.startResizeX = e.clientX;
		this.startWidth = this.container.getBoundingClientRect().width;
		try {
			this.resizeHandle?.setPointerCapture(e.pointerId);
		} catch {
			// Not critical.
		}
		this.resizeHandle?.addEventListener('pointermove', this.onResizeMove);
		this.resizeHandle?.addEventListener('pointerup', this.onResizeUp);
		this.resizeHandle?.addEventListener('pointercancel', this.onResizeUp);
		e.preventDefault();
		e.stopPropagation();
	}

	private handleResizeMove(e: PointerEvent): void {
		if (
			!this.resizing ||
			e.pointerId !== this.activeResizePointerId ||
			!this.container
		) {
			return;
		}
		const dx = e.clientX - this.startResizeX;
		this.width = this.clampWidth(this.startWidth + dx);
		this.container.style.width = `${this.width}px`;
		// The width changed: re-clamp the position within the viewport.
		this.applyPosition();
		e.preventDefault();
	}

	private handleResizeUp(e: PointerEvent): void {
		if (e.pointerId !== this.activeResizePointerId) {
			return;
		}
		this.resizing = false;
		this.activeResizePointerId = null;
		this.detachResizeListeners();
		try {
			this.resizeHandle?.releasePointerCapture(e.pointerId);
		} catch {
			// Ignore.
		}
		this.storage.writeJSON(WIDTH_KEY, this.width);
	}

	// --- Height resize handling (updates the max-height) --------------------

	private handleHeightResizeDown(e: PointerEvent): void {
		if (e.pointerType === 'mouse' && e.button !== 0) {
			return;
		}
		if (!this.container) {
			return;
		}
		this.resizingHeight = true;
		this.activeHeightPointerId = e.pointerId;
		this.startResizeY = e.clientY;
		// Start height = current rendered height of the panel.
		this.startHeight = this.container.getBoundingClientRect().height;
		this.currentHeightPx = this.startHeight;
		try {
			this.resizeHandleY?.setPointerCapture(e.pointerId);
		} catch {
			// Not critical.
		}
		this.resizeHandleY?.addEventListener(
			'pointermove',
			this.onHeightResizeMove,
		);
		this.resizeHandleY?.addEventListener('pointerup', this.onHeightResizeUp);
		this.resizeHandleY?.addEventListener(
			'pointercancel',
			this.onHeightResizeUp,
		);
		e.preventDefault();
		e.stopPropagation();
	}

	private handleHeightResizeMove(e: PointerEvent): void {
		if (!this.resizingHeight || e.pointerId !== this.activeHeightPointerId) {
			return;
		}
		const dy = e.clientY - this.startResizeY;
		this.currentHeightPx = this.clampHeight(this.startHeight + dy);
		// Apply the max-height in px on the root panel (pane.element): beyond the
		// cap the panel scrolls (see scroll.ts/styles.ts).
		applyMaxHeight(this.pane.element, `${this.currentHeightPx}px`);
		e.preventDefault();
	}

	private handleHeightResizeUp(e: PointerEvent): void {
		if (e.pointerId !== this.activeHeightPointerId) {
			return;
		}
		this.resizingHeight = false;
		this.activeHeightPointerId = null;
		this.detachHeightResizeListeners();
		try {
			this.resizeHandleY?.releasePointerCapture(e.pointerId);
		} catch {
			// Ignore.
		}
		// Persist the max-height in px chosen by the user (wins over the default).
		if (this.currentHeightPx > 0) {
			this.storage.writeJSON(MAXHEIGHT_KEY, `${this.currentHeightPx}px`);
		}
	}

	// --- CORNER resize handling (width + height together) -------------------

	private handleCornerResizeDown(e: PointerEvent): void {
		if (e.pointerType === 'mouse' && e.button !== 0) {
			return;
		}
		if (!this.container) {
			return;
		}
		this.resizingCorner = true;
		this.activeCornerPointerId = e.pointerId;
		this.startCornerX = e.clientX;
		this.startCornerY = e.clientY;
		const rect = this.container.getBoundingClientRect();
		this.startCornerWidth = rect.width;
		this.startCornerHeight = rect.height;
		this.width = this.clampWidth(rect.width);
		this.currentHeightPx = this.clampHeight(rect.height);
		try {
			this.resizeHandleCorner?.setPointerCapture(e.pointerId);
		} catch {
			// Not critical.
		}
		this.resizeHandleCorner?.addEventListener(
			'pointermove',
			this.onCornerResizeMove,
		);
		this.resizeHandleCorner?.addEventListener(
			'pointerup',
			this.onCornerResizeUp,
		);
		this.resizeHandleCorner?.addEventListener(
			'pointercancel',
			this.onCornerResizeUp,
		);
		e.preventDefault();
		e.stopPropagation();
	}

	private handleCornerResizeMove(e: PointerEvent): void {
		if (
			!this.resizingCorner ||
			e.pointerId !== this.activeCornerPointerId ||
			!this.container
		) {
			return;
		}
		const dx = e.clientX - this.startCornerX;
		const dy = e.clientY - this.startCornerY;
		// Width (like the right handle).
		this.width = this.clampWidth(this.startCornerWidth + dx);
		this.container.style.width = `${this.width}px`;
		// Height -> max-height (like the bottom handle).
		this.currentHeightPx = this.clampHeight(this.startCornerHeight + dy);
		applyMaxHeight(this.pane.element, `${this.currentHeightPx}px`);
		// The width changed: re-clamp the position within the viewport.
		this.applyPosition();
		e.preventDefault();
	}

	private handleCornerResizeUp(e: PointerEvent): void {
		if (e.pointerId !== this.activeCornerPointerId) {
			return;
		}
		this.resizingCorner = false;
		this.activeCornerPointerId = null;
		this.detachCornerResizeListeners();
		try {
			this.resizeHandleCorner?.releasePointerCapture(e.pointerId);
		} catch {
			// Ignore.
		}
		// Persist both dimensions chosen by the user.
		this.storage.writeJSON(WIDTH_KEY, this.width);
		if (this.currentHeightPx > 0) {
			this.storage.writeJSON(MAXHEIGHT_KEY, `${this.currentHeightPx}px`);
		}
	}

	// --- Helpers ------------------------------------------------------------

	private detachMoveListeners(): void {
		this.handle?.removeEventListener('pointermove', this.onPointerMove);
		this.handle?.removeEventListener('pointerup', this.onPointerUp);
		this.handle?.removeEventListener('pointercancel', this.onPointerUp);
	}

	private detachResizeListeners(): void {
		this.resizeHandle?.removeEventListener('pointermove', this.onResizeMove);
		this.resizeHandle?.removeEventListener('pointerup', this.onResizeUp);
		this.resizeHandle?.removeEventListener('pointercancel', this.onResizeUp);
	}

	private detachHeightResizeListeners(): void {
		this.resizeHandleY?.removeEventListener(
			'pointermove',
			this.onHeightResizeMove,
		);
		this.resizeHandleY?.removeEventListener('pointerup', this.onHeightResizeUp);
		this.resizeHandleY?.removeEventListener(
			'pointercancel',
			this.onHeightResizeUp,
		);
	}

	private detachCornerResizeListeners(): void {
		this.resizeHandleCorner?.removeEventListener(
			'pointermove',
			this.onCornerResizeMove,
		);
		this.resizeHandleCorner?.removeEventListener(
			'pointerup',
			this.onCornerResizeUp,
		);
		this.resizeHandleCorner?.removeEventListener(
			'pointercancel',
			this.onCornerResizeUp,
		);
	}

	/** Constrains the pane width between MIN_WIDTH and MAX_WIDTH. */
	private clampWidth(w: number): number {
		return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(w)));
	}

	/** Constrains the panel height between MIN_HEIGHT and the viewport height. */
	private clampHeight(h: number): number {
		const vh = typeof window !== 'undefined' ? window.innerHeight : h;
		return Math.min(vh, Math.max(MIN_HEIGHT, Math.round(h)));
	}

	/** Writes left/top on the container from the current position. */
	private applyPosition(): void {
		if (!this.container) {
			return;
		}
		const clamped = this.clamp(this.position);
		this.position = clamped;
		this.container.style.left = `${clamped.x}px`;
		this.container.style.top = `${clamped.y}px`;
	}

	/** Keeps the position within the viewport edges (if enabled). */
	private clamp(p: DriftpanePosition): DriftpanePosition {
		if (!this.clampEnabled || !this.container) {
			return {x: p.x, y: p.y};
		}
		const rect = this.container.getBoundingClientRect();
		const vw = typeof window !== 'undefined' ? window.innerWidth : rect.width;
		const vh = typeof window !== 'undefined' ? window.innerHeight : rect.height;
		const maxX = Math.max(0, vw - rect.width);
		const maxY = Math.max(0, vh - rect.height);
		return {
			x: Math.min(Math.max(0, p.x), maxX),
			y: Math.min(Math.max(0, p.y), maxY),
		};
	}

	private savePosition(): void {
		this.storage.writeJSON(POSITION_KEY, this.position);
	}
}
