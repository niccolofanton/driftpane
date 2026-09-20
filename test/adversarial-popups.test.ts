import {readFileSync} from 'node:fs';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {PopupLayer} from '../src/popups.js';

const cleanups: Array<() => void> = [];

afterEach(() => {
	cleanups
		.splice(0)
		.reverse()
		.forEach((cleanup) => cleanup());
	vi.restoreAllMocks();
	document.body.innerHTML = '';
});

function popupFixture() {
	const ancestor = document.createElement('div');
	const host = document.createElement('div');
	host.className = 'tp-rotv tp-rotv-expanded';
	const anchor = document.createElement('div');
	const popup = document.createElement('div');
	popup.className = 'tp-popv tp-popv-v';
	anchor.append(popup);
	host.append(anchor);
	ancestor.append(host);
	document.body.append(ancestor);
	let anchorTop = 100;
	const anchorRect = () => new DOMRect(100, anchorTop, 200, 20);
	vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(anchorRect);
	vi.spyOn(anchor, 'getClientRects').mockImplementation(
		() => [anchorRect()] as unknown as DOMRectList,
	);
	vi.spyOn(popup, 'getBoundingClientRect').mockImplementation(
		() => new DOMRect(100, 0, 200, 100),
	);
	let open = false;
	popup.showPopover = () => {
		open = true;
	};
	popup.hidePopover = () => {
		open = false;
	};
	const nativeMatches = popup.matches.bind(popup);
	vi.spyOn(popup, 'matches').mockImplementation((selector) =>
		selector === ':popover-open' ? open : nativeMatches(selector),
	);
	const layer = new PopupLayer(host);
	cleanups.push(() => layer.dispose());
	return {
		ancestor,
		host,
		anchor,
		popup,
		layer,
		move: (top: number) => {
			anchorTop = top;
		},
	};
}

describe('adversarial popup anchoring', () => {
	it.each(['ancestor', 'document', 'window'] as const)(
		'repositions an open popup when the %s scrolls',
		(target) => {
			const fixture = popupFixture();
			expect(fixture.popup.style.top).toBe('120px');
			fixture.move(50);
			const eventTarget =
				target === 'ancestor'
					? fixture.ancestor
					: target === 'document'
						? document
						: window;
			eventTarget.dispatchEvent(new Event('scroll'));
			expect(fixture.popup.style.top).toBe('70px');
		},
	);

	it('removes external scroll listeners and restores popup styles on dispose', () => {
		const fixture = popupFixture();
		fixture.layer.dispose();
		fixture.move(50);
		fixture.ancestor.dispatchEvent(new Event('scroll'));
		document.dispatchEvent(new Event('scroll'));
		expect(fixture.popup.getAttribute('style')).toBeNull();
		expect(fixture.popup.hasAttribute('popover')).toBe(false);
	});
});

describe('adversarial popup theme inheritance', () => {
	it('does not apply an ancestor light shadow to an explicitly dark panel popup', () => {
		const style = document.createElement('style');
		style.textContent =
			'.tp-popv {box-shadow: 0 2px 4px rgba(0, 0, 0, 0.6)}' +
			readFileSync('theme.css', 'utf8');
		document.head.append(style);
		cleanups.push(() => style.remove());
		const light = document.createElement('div');
		light.dataset.theme = 'light';
		const darkPane = document.createElement('div');
		darkPane.className = 'tp-rotv';
		darkPane.dataset.theme = 'dark';
		const popup = document.createElement('div');
		popup.className = 'tp-popv';
		darkPane.append(popup);
		light.append(darkPane);
		document.body.append(light);
		expect(getComputedStyle(popup).boxShadow).toBe(
			'0 2px 4px rgba(0, 0, 0, 0.6)',
		);
		darkPane.dataset.theme = 'light';
		expect(getComputedStyle(popup).boxShadow).toContain('0 12px 32px');
	});
});
