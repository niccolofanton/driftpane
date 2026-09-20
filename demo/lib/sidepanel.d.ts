import type { DriftpaneSidepanelOptions } from './types.js';
/** Non-modal, viewport-docked presentation. Floating layout is restored on dispose. */
export declare class SidepanelController {
    private readonly pane;
    readonly element: HTMLElement;
    private readonly marker;
    private readonly closeButton;
    readonly trigger: HTMLButtonElement | null;
    private hoverTimer;
    private pointerInside;
    private readonly target;
    private readonly win;
    private readonly side;
    private readonly mode;
    private width;
    private opened;
    private disposed;
    private returnFocus;
    constructor(pane: HTMLElement, options?: DriftpaneSidepanelOptions);
    get isOpen(): boolean;
    open: () => void;
    close: () => void;
    toggle(): void;
    setWidth(width: number): void;
    private onTriggerClick;
    private onPointerEnter;
    private onPointerLeave;
    private scheduleClose;
    private validWidth;
    private setOpen;
    private onKeyDown;
    private layout;
    private updatePush;
    private writePush;
    dispose(): void;
}
