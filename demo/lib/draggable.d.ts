import { DriftpaneStorage } from './storage.js';
import { DriftpanePosition } from './types.js';
/**
 * Selector of the root pane title-bar used as the drag handle.
 * Verified in the core: the root pane uses viewName 'rot' and the title button is
 * `ClassName('rot')('b')` => '.tp-rotv_b'.
 */
export declare const DRAG_HANDLE_SELECTOR = ".tp-rotv_b";
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
export declare class DraggableController {
    private readonly pane;
    private readonly win;
    private readonly storage;
    private readonly clampEnabled;
    private readonly defaultPosition;
    private readonly resizableWidth;
    private readonly resizableHeight;
    private container;
    private originalMarker;
    private originallyDetached;
    private handle;
    private resizeHandle;
    private resizeHandleY;
    private resizeHandleCorner;
    private position;
    /** User-preferred width; viewport adaptation must not overwrite it. */
    private width;
    private sizeObserver;
    private previousCursor;
    private previousTouchAction;
    private widthChanged;
    private heightChanged;
    private resizing;
    private activeResizePointerId;
    private startResizeX;
    private startWidth;
    private resizingHeight;
    private activeHeightPointerId;
    private startResizeY;
    private startHeight;
    private currentHeightPx;
    private resizingCorner;
    private activeCornerPointerId;
    private startCornerX;
    private startCornerY;
    private startCornerWidth;
    private startCornerHeight;
    private enabled;
    private disposed;
    private dragging;
    private moved;
    private activePointerId;
    private grabOffsetX;
    private grabOffsetY;
    private startPointerX;
    private startPointerY;
    private readonly onPointerDown;
    private readonly onPointerMove;
    private readonly onPointerUp;
    private readonly onClickCapture;
    private readonly onResize;
    private readonly onResizeDown;
    private readonly onResizeMove;
    private readonly onResizeUp;
    private readonly onHeightResizeDown;
    private readonly onHeightResizeMove;
    private readonly onHeightResizeUp;
    private readonly onCornerResizeDown;
    private readonly onCornerResizeMove;
    private readonly onCornerResizeUp;
    constructor(pane: PaneLike, storage: DriftpaneStorage, opts: DraggableOptions);
    /**
     * Enables the drag: creates the fixed container around pane.element and wires
     * up the event listeners. Idempotent.
     */
    enable(): void;
    /** Disables the drag by removing the listeners (keeps the container). */
    disable(): void;
    /** Sets a new position (clamped) and persists it. */
    setPosition(p: DriftpanePosition): void;
    /** Sets and persists the preferred width, adapting its rendered size to the viewport. */
    setWidth(width: number): void;
    /** Returns the preferred width (the rendered width can be smaller on narrow screens). */
    getWidth(): number;
    /** Returns the current position (copy). */
    getPosition(): DriftpanePosition;
    /** Returns the panel to the default position. */
    resetPosition(): void;
    /** Tears everything down and restores the pane's original DOM placement. */
    dispose(): void;
    private handlePointerDown;
    private handlePointerMove;
    private handlePointerUp;
    private handleClickCapture;
    private handleResize;
    private handleResizeDown;
    private handleResizeMove;
    private handleResizeUp;
    private handleHeightResizeDown;
    private handleHeightResizeMove;
    private handleHeightResizeUp;
    private handleCornerResizeDown;
    private handleCornerResizeMove;
    private handleCornerResizeUp;
    private isInteracting;
    private isCollapsed;
    private releaseCapture;
    private applyWidth;
    private reclampPosition;
    private detachMoveListeners;
    private detachResizeListeners;
    private detachHeightResizeListeners;
    private detachCornerResizeListeners;
    /** Constrains the pane width between MIN_WIDTH and MAX_WIDTH. */
    private clampWidth;
    /** Constrains the panel height between MIN_HEIGHT and the viewport height. */
    private clampHeight;
    /** Writes left/top on the container from the current position. */
    private applyPosition;
    /** Keeps the position within the viewport edges (if enabled). */
    private clamp;
    private savePosition;
}
