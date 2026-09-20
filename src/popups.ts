/** Keep native Tweakpane popups interactive outside the scrolling content. */
export class PopupLayer {
	private readonly observer: MutationObserver | null;
	private readonly popups = new Map<
		HTMLElement,
		{style: string | null; popover: string | null}
	>();
	private readonly win: Window | null;
	private readonly update = (): void => this.sync();

	constructor(private readonly host: HTMLElement) {
		this.win = host.ownerDocument.defaultView;
		this.observer =
			typeof MutationObserver === 'undefined'
				? null
				: new MutationObserver(this.update);
		this.observer?.observe(host, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: ['class'],
		});
		// Capture non-bubbling scroll events from the document and every ancestor,
		// not only from the pane's internal scroller: top-layer popups are fixed
		// to the viewport even when the pane is embedded in ordinary page layout.
		this.win?.addEventListener('scroll', this.update, true);
		host.addEventListener('driftpane-layout', this.update);
		this.win?.addEventListener('resize', this.update);
		this.sync();
	}

	private sync(): void {
		for (const [popup] of this.popups) {
			if (!this.host.contains(popup)) {
				this.restore(popup);
			}
		}
		for (const popup of this.host.querySelectorAll<HTMLElement>('.tp-popv')) {
			if (!this.popups.has(popup)) {
				this.popups.set(popup, {
					style: popup.getAttribute('style'),
					popover: popup.getAttribute('popover'),
				});
			}
			if (typeof popup.showPopover !== 'function') {
				// Older engines: keep the same picker and focus handlers, but let an
				// expanded picker occupy layout space so it can be scrolled into view.
				popup.setAttribute('data-driftpane-inline-popup', '');
				continue;
			}
			const anchor = popup.parentElement;
			const visible =
				popup.classList.contains('tp-popv-v') &&
				anchor &&
				!anchor.closest(
					'.tp-rotv:not(.tp-rotv-expanded), .tp-fldv:not(.tp-fldv-expanded), [inert]',
				) &&
				anchor.getClientRects().length > 0;
			if (!visible) {
				if (popup.matches(':popover-open')) popup.hidePopover();
				continue;
			}
			if (!popup.matches(':popover-open')) {
				// The top layer escapes overflow without moving the DOM node: the
				// core's contains()/blur logic, inherited theme and event paths survive.
				const computed = this.win?.getComputedStyle(popup);
				const width = popup.getBoundingClientRect().width;
				popup.style.borderStyle = computed?.borderStyle ?? 'none';
				popup.style.borderWidth = computed?.borderWidth ?? '0';
				popup.style.borderColor = `var(--dp-glass-border, ${computed?.borderColor ?? 'transparent'})`;
				popup.style.color = 'inherit';
				popup.style.boxSizing = 'border-box';
				popup.style.width = `${width || anchor.getBoundingClientRect().width}px`;
				popup.style.position = 'fixed';
				popup.style.margin = '0';
				popup.style.inset = 'auto';
				popup.setAttribute('popover', 'manual');
				popup.showPopover();
			}
			this.position(popup, anchor);
		}
	}

	private position(popup: HTMLElement, anchor: HTMLElement): void {
		const rect = anchor.getBoundingClientRect();
		const viewportWidth = this.win?.innerWidth ?? 0;
		const viewportHeight = this.win?.innerHeight ?? 0;
		popup.style.maxWidth = `${Math.max(0, viewportWidth - 8)}px`;
		popup.style.maxHeight = `${Math.max(0, viewportHeight - 8)}px`;
		popup.style.overflow = 'auto';
		const size = popup.getBoundingClientRect();
		const top =
			rect.bottom + size.height <= viewportHeight - 4
				? rect.bottom
				: rect.top - size.height;
		popup.style.left = `${Math.max(4, Math.min(rect.right - size.width, viewportWidth - size.width - 4))}px`;
		popup.style.top = `${Math.max(4, Math.min(top, viewportHeight - size.height - 4))}px`;
	}

	private restore(popup: HTMLElement): void {
		const original = this.popups.get(popup);
		if (!original) return;
		if (
			typeof popup.hidePopover === 'function' &&
			popup.matches(':popover-open')
		)
			popup.hidePopover();
		if (original.style === null) popup.removeAttribute('style');
		else popup.setAttribute('style', original.style);
		if (original.popover === null) popup.removeAttribute('popover');
		else popup.setAttribute('popover', original.popover);
		popup.removeAttribute('data-driftpane-inline-popup');
		this.popups.delete(popup);
	}

	public dispose(): void {
		this.observer?.disconnect();
		this.win?.removeEventListener('scroll', this.update, true);
		this.host.removeEventListener('driftpane-layout', this.update);
		this.win?.removeEventListener('resize', this.update);
		for (const popup of this.popups.keys()) this.restore(popup);
	}
}
