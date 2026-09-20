/** Keep native Tweakpane popups interactive outside the scrolling content. */
export declare class PopupLayer {
    private readonly host;
    private readonly observer;
    private readonly popups;
    private readonly win;
    private readonly update;
    constructor(host: HTMLElement);
    private sync;
    private position;
    private restore;
    dispose(): void;
}
