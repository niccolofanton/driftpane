import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PopupLayer} from '../src/popups.js';
import {applyMaxHeight, clearMaxHeight} from '../src/scroll.js';
import {injectStyles} from '../src/styles.js';

function rect(x: number, y: number, width: number, height: number): DOMRect {
	return {
		x,
		y,
		left: x,
		top: y,
		right: x + width,
		bottom: y + height,
		width,
		height,
		toJSON: () => ({}),
	};
}

async function mutations(): Promise<void> {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe('popup layer lifecycle', () => {
	let host: HTMLElement;
	let anchor: HTMLElement;
	let popup: HTMLElement;
	let layer: PopupLayer | undefined;
	let anchorRect: DOMRect;
	let open: boolean;
	let show: ReturnType<typeof vi.fn>;
	let hide: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		document.body.innerHTML = '';
		document.head.innerHTML = '';
		window.innerWidth = 1000;
		window.innerHeight = 800;
		host = document.createElement('div');
		host.className = 'tp-rotv tp-rotv-expanded';
		anchor = document.createElement('div');
		anchor.className = 'tp-colv';
		popup = document.createElement('div');
		popup.className = 'tp-popv';
		anchor.append(popup);
		host.append(anchor);
		document.body.append(host);
		anchorRect = rect(100, 100, 160, 20);
		vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(
			() => anchorRect,
		);
		vi.spyOn(anchor, 'getClientRects').mockReturnValue([
			anchorRect,
		] as unknown as DOMRectList);
		vi.spyOn(popup, 'getBoundingClientRect').mockReturnValue(
			rect(100, 120, 168, 138),
		);
		open = false;
		show = vi.fn(() => {
			open = true;
		});
		hide = vi.fn(() => {
			open = false;
		});
	});

	afterEach(() => {
		layer?.dispose();
		clearMaxHeight(host);
		vi.restoreAllMocks();
	});

	function withPopover(): void {
		popup.showPopover = show;
		popup.hidePopover = hide;
		const matches = popup.matches.bind(popup);
		vi.spyOn(popup, 'matches').mockImplementation((selector) =>
			selector === ':popover-open' ? open : matches(selector),
		);
	}

	it('keeps the existing DOM and focus handlers while opening, closing and reopening', async () => {
		withPopover();
		const input = document.createElement('input');
		popup.append(input);
		const edited = vi.fn();
		input.addEventListener('input', edited);
		layer = new PopupLayer(host);
		popup.classList.add('tp-popv-v');
		await mutations();
		expect(show).toHaveBeenCalledOnce();
		expect(popup.parentElement).toBe(anchor);
		input.focus();
		input.dispatchEvent(new Event('input'));
		expect(document.activeElement).toBe(input);
		expect(edited).toHaveBeenCalledOnce();
		popup.classList.remove('tp-popv-v');
		await mutations();
		expect(hide).toHaveBeenCalledOnce();
		popup.classList.add('tp-popv-v');
		await mutations();
		expect(show).toHaveBeenCalledTimes(2);
	});

	it('restores original attributes on dispose and removes all future updates', async () => {
		withPopover();
		popup.setAttribute('style', 'color: red;');
		popup.setAttribute('popover', 'auto');
		popup.classList.add('tp-popv-v');
		layer = new PopupLayer(host);
		expect(open).toBe(true);
		layer.dispose();
		expect(open).toBe(false);
		expect(popup.getAttribute('style')).toBe('color: red;');
		expect(popup.getAttribute('popover')).toBe('auto');
		popup.classList.remove('tp-popv-v');
		popup.classList.add('tp-popv-v');
		host.dispatchEvent(new Event('scroll'));
		host.dispatchEvent(new Event('driftpane-layout'));
		window.dispatchEvent(new Event('resize'));
		await mutations();
		expect(show).toHaveBeenCalledOnce();
	});

	it('restores and forgets a popup removed from its pane', async () => {
		withPopover();
		popup.classList.add('tp-popv-v');
		layer = new PopupLayer(host);
		popup.remove();
		await mutations();
		expect(open).toBe(false);
		expect(popup.hasAttribute('popover')).toBe(false);
		expect(popup.hasAttribute('style')).toBe(false);
		layer.dispose();
		expect(hide).toHaveBeenCalledOnce();
	});

	it('positions an open popup again after content scrolling or panel movement', () => {
		withPopover();
		popup.classList.add('tp-popv-v');
		layer = new PopupLayer(host);
		expect(popup.style.top).toBe('120px');
		anchorRect = rect(200, 200, 160, 20);
		anchor.dispatchEvent(new Event('scroll'));
		expect(popup.style.top).toBe('220px');
		anchorRect = rect(200, 300, 160, 20);
		host.dispatchEvent(new Event('driftpane-layout'));
		expect(popup.style.top).toBe('320px');
		expect(show).toHaveBeenCalledOnce();
	});

	it('closes a top-layer popup when the root folds even if its descendants retain layout boxes', async () => {
		withPopover();
		popup.classList.add('tp-popv-v');
		layer = new PopupLayer(host);
		host.classList.remove('tp-rotv-expanded');
		await mutations();
		expect(open).toBe(false);
	});

	it('closes a top-layer popup immediately when its parent folder folds', async () => {
		withPopover();
		const folder = document.createElement('div');
		folder.className = 'tp-fldv tp-fldv-expanded';
		host.append(folder);
		folder.append(anchor);
		popup.classList.add('tp-popv-v');
		layer = new PopupLayer(host);
		folder.classList.remove('tp-fldv-expanded');
		await mutations();
		expect(open).toBe(false);
	});

	it('uses inline layout in engines without popovers and restores it on cleanup', async () => {
		injectStyles(document);
		applyMaxHeight(host, '400px');
		expect(popup.hasAttribute('data-driftpane-inline-popup')).toBe(true);
		expect(getComputedStyle(popup).position).toBe('relative');
		clearMaxHeight(host);
		expect(popup.hasAttribute('data-driftpane-inline-popup')).toBe(false);
		const later = document.createElement('div');
		later.className = 'tp-popv';
		host.append(later);
		await mutations();
		expect(later.hasAttribute('data-driftpane-inline-popup')).toBe(false);
	});

	it('adapts popups added dynamically and does not create multiple layers on cap updates', async () => {
		const add = vi.spyOn(window, 'addEventListener');
		applyMaxHeight(host, '400px');
		applyMaxHeight(host, '500px');
		expect(add.mock.calls.filter(([type]) => type === 'scroll')).toHaveLength(
			1,
		);
		const dynamic = document.createElement('div');
		dynamic.className = 'tp-popv tp-popv-v';
		host.append(dynamic);
		await mutations();
		expect(dynamic.hasAttribute('data-driftpane-inline-popup')).toBe(true);
		clearMaxHeight(host);
		expect(dynamic.hasAttribute('data-driftpane-inline-popup')).toBe(false);
	});
	it('preserves the popup border-box width through repeated open/close cycles', async () => {
		withPopover();
		popup.style.padding = '4px';
		popup.style.border = '1px solid black';
		vi.mocked(popup.getBoundingClientRect).mockImplementation(() =>
			rect(
				100,
				120,
				(Number.parseFloat(popup.style.width) || 158) +
					(popup.style.boxSizing === 'border-box' ? 0 : 10),
				138,
			),
		);
		layer = new PopupLayer(host);
		for (let i = 0; i < 3; i++) {
			popup.classList.add('tp-popv-v');
			await mutations();
			expect(popup.getBoundingClientRect().width).toBe(168);
			popup.classList.remove('tp-popv-v');
			await mutations();
		}
	});
});
