import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane} from '../src/driftpane.js';
import {SidepanelController} from '../src/sidepanel.js';
import {FakePane} from './helpers/fake-pane.js';

describe('sidepanel', () => {
	const cleanups: Array<() => void> = [];
	beforeEach(() => {
		document.body.innerHTML = '';
		document.body.removeAttribute('style');
		localStorage.clear();
		vi.stubGlobal('innerWidth', 1200);
	});
	afterEach(() => {
		cleanups
			.splice(0)
			.reverse()
			.forEach((fn) => fn());
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});
	function panel(
		options: ConstructorParameters<typeof SidepanelController>[1] = {},
	) {
		const parent = document.createElement('div');
		const pane = document.createElement('div');
		parent.append(pane);
		document.body.append(parent);
		const controller = new SidepanelController(pane, options);
		cleanups.push(() => controller.dispose());
		return {controller, pane, parent};
	}
	it('hover opens at the edge without stealing focus and closes on pointer exit', () => {
		vi.useFakeTimers();
		const opener = document.createElement('button');
		document.body.append(opener);
		opener.focus();
		const {controller} = panel({mode: 'hover'});
		expect(controller.isOpen).toBe(false);
		expect(controller.trigger?.hidden).toBe(false);
		controller.trigger?.dispatchEvent(new Event('pointerenter'));
		expect(controller.isOpen).toBe(true);
		expect(document.activeElement).toBe(opener);
		controller.element.dispatchEvent(new Event('pointerleave'));
		vi.advanceTimersByTime(200);
		expect(controller.isOpen).toBe(false);
		expect(controller.trigger?.hidden).toBe(false);
	});
	it('hover permits keyboard and touch activation through its edge button', () => {
		const {controller} = panel({mode: 'hover'});
		controller.trigger?.focus();
		controller.trigger?.click();
		expect(controller.isOpen).toBe(true);
		expect(document.activeElement).toBe(
			controller.element.querySelector('button'),
		);
		controller.element.dispatchEvent(
			new KeyboardEvent('keydown', {key: 'Escape'}),
		);
		expect(document.activeElement).toBe(controller.trigger);
		expect(controller.trigger?.getAttribute('aria-expanded')).toBe('false');
	});
	it('cancels hover closing when the pointer re-enters and removes the edge tab on dispose', () => {
		vi.useFakeTimers();
		const {controller} = panel({mode: 'hover'});
		controller.trigger?.dispatchEvent(new Event('pointerenter'));
		controller.element.dispatchEvent(new Event('pointerleave'));
		controller.element.dispatchEvent(new Event('pointerenter'));
		vi.advanceTimersByTime(200);
		expect(controller.isOpen).toBe(true);
		controller.element.dispatchEvent(new Event('pointerleave'));
		controller.dispose();
		vi.advanceTimersByTime(200);
		expect(document.querySelector('.driftpane-sidepanel-trigger')).toBeNull();
	});
	it('restores exact pane position and existing inline styles on disposal', () => {
		const {controller, pane, parent} = panel();
		const next = document.createElement('div');
		parent.append(next);
		pane.style.width = '99px';
		controller.dispose();
		expect(parent.firstChild).toBe(pane);
		expect(pane.nextSibling).toBe(next);
		expect(pane.style.width).toBe('99px');
		expect(document.querySelector('.driftpane-sidepanel')).toBeNull();
	});
	it('overlay never changes page margins', () => {
		document.body.style.marginRight = '17px';
		const {controller} = panel();
		controller.close();
		controller.open();
		expect(document.body.style.marginRight).toBe('17px');
	});
	it('push reserves width only while open and restores original priority', () => {
		document.body.style.setProperty('margin-right', '12px', 'important');
		const {controller} = panel({mode: 'push', width: 350});
		expect(document.body.style.marginRight).toContain('362px');
		controller.setWidth(400);
		expect(document.body.style.marginRight).toContain('412px');
		controller.close();
		expect(document.body.style.marginRight).toBe('12px');
		expect(document.body.style.getPropertyPriority('margin-right')).toBe(
			'important',
		);
	});
	it('keeps other panels push contributions when one closes', () => {
		const a = panel({mode: 'push', side: 'left', width: 240}).controller;
		const b = panel({mode: 'push', width: 300}).controller;
		a.dispose();
		expect(document.body.style.marginRight).toContain('308px');
		b.dispose();
		expect(document.body.style.marginRight).toBe('');
		expect(document.body.style.marginLeft).toBe('');
	});
	it('uses a custom push target without touching body', () => {
		const target = document.createElement('main');
		document.body.append(target);
		const {controller} = panel({mode: 'push', pushTarget: target});
		expect(target.style.marginRight).toContain('320px');
		expect(document.body.style.marginRight).toBe('');
		controller.dispose();
		expect(target.style.marginRight).toBe('');
	});
	it('switches push to overlay on mobile, clamps width and recovers on resize', () => {
		const {controller} = panel({mode: 'push', width: 700});
		vi.stubGlobal('innerWidth', 390);
		window.dispatchEvent(new Event('resize'));
		expect(controller.element.style.width).toBe('390px');
		expect(controller.element.dataset.mode).toBe('overlay');
		expect(document.body.style.marginRight).toBe('');
		vi.stubGlobal('innerWidth', 1200);
		window.dispatchEvent(new Event('resize'));
		expect(controller.element.style.width).toBe('700px');
		expect(document.body.style.marginRight).toContain('708px');
	});
	it('hides controls from keyboard navigation and returns focus on Escape', () => {
		const opener = document.createElement('button');
		document.body.append(opener);
		opener.focus();
		const {controller} = panel({open: false});
		expect(controller.element.hasAttribute('inert')).toBe(true);
		controller.open();
		expect(document.activeElement).toBe(
			controller.element.querySelector('button'),
		);
		controller.element.dispatchEvent(
			new KeyboardEvent('keydown', {key: 'Escape'}),
		);
		expect(controller.isOpen).toBe(false);
		expect(document.activeElement).toBe(opener);
	});
	it('ignores invalid runtime widths and calls after disposal', () => {
		const {controller} = panel({width: NaN});
		controller.setWidth(Infinity);
		expect(controller.element.style.width).toBe('320px');
		controller.dispose();
		controller.open();
		controller.setWidth(500);
		expect(controller.isOpen).toBe(false);
		expect(document.querySelector('.driftpane-sidepanel')).toBeNull();
	});
	it('facade switches presentations without losing state or accumulating drag handles', () => {
		const pane = new FakePane({
			initialState: {children: [{binding: {key: 'gain', value: 7}}]},
		});
		const drift = createDriftpane(pane, {
			urlSync: false,
			presetsEnabled: false,
		});
		cleanups.push(() => drift.dispose());
		const state = pane.exportState();
		for (let i = 0; i < 3; i++) {
			drift.setSidepanel({mode: 'push'});
			expect(
				document.querySelectorAll('.driftpane-resize-handle'),
			).toHaveLength(0);
			drift.setSidepanel(false);
			expect(document.querySelectorAll('.driftpane-sidepanel')).toHaveLength(0);
			expect(
				document.querySelectorAll('.driftpane-resize-handle'),
			).toHaveLength(1);
		}
		expect(pane.exportState()).toEqual(state);
	});
	it('facade starts docked and restores margins on disposal', () => {
		const pane = new FakePane();
		const drift = createDriftpane(pane, {
			sidepanel: {mode: 'push'},
			urlSync: false,
		});
		expect(drift.sidepanel?.isOpen).toBe(true);
		expect(pane.element.parentElement).toBe(drift.sidepanel?.element);
		drift.dispose();
		drift.setSidepanel({});
		expect(document.body.style.marginRight).toBe('');
		expect(drift.sidepanel).toBeNull();
	});
});
