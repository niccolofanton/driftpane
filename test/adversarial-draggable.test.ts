import {Pane} from 'tweakpane';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DraggableController} from '../src/draggable.js';
import {createDriftpane} from '../src/driftpane.js';
import {DriftpaneStorage} from '../src/storage.js';

const cleanup: Array<() => void> = [];
function pointer(
	target: HTMLElement,
	type: string,
	pointerId: number,
	x: number,
	y: number,
) {
	const event = new MouseEvent(type, {
		clientX: x,
		clientY: y,
		bubbles: true,
		cancelable: true,
	});
	Object.defineProperties(event, {
		pointerId: {value: pointerId},
		pointerType: {value: 'touch'},
	});
	target.dispatchEvent(event);
}
function setup(doc = document) {
	const element = doc.createElement('div');
	element.innerHTML = '<button class="tp-rotv_b">Title</button>';
	doc.body.appendChild(element);
	const controller = new DraggableController(
		{element},
		new DriftpaneStorage('adversarial-drag'),
		{
			clampToViewport: true,
			defaultPosition: {x: 24, y: 24},
		},
	);
	cleanup.push(() => controller.dispose());
	controller.enable();
	const wrapper = element.parentElement as HTMLElement;
	vi.spyOn(wrapper, 'getBoundingClientRect').mockImplementation(() => {
		const width = Number.parseFloat(wrapper.style.width);
		const left = Number.parseFloat(wrapper.style.left);
		const top = Number.parseFloat(wrapper.style.top);
		return {
			x: left,
			y: top,
			left,
			top,
			right: left + width,
			bottom: top + 100,
			width,
			height: 100,
			toJSON: () => ({}),
		};
	});
	return {
		controller,
		element,
		wrapper,
		title: element.querySelector('button') as HTMLElement,
	};
}
beforeEach(() => {
	localStorage.clear();
	document.body.innerHTML = '';
	window.innerWidth = 1000;
	window.innerHeight = 800;
});
afterEach(() => {
	for (const dispose of cleanup.splice(0).reverse()) dispose();
	vi.restoreAllMocks();
});

describe('adversarial draggable review', () => {
	it('ignores malformed persisted position instead of crashing real facade initialization', () => {
		localStorage.setItem('driftpane:invalid-position:position', 'null');
		const pane = new Pane({title: 'Parameters'});
		cleanup.push(() => pane.dispose());
		expect(() => {
			const drift = createDriftpane(pane, {
				storageNamespace: 'invalid-position',
				urlSync: false,
			});
			cleanup.push(() => drift.dispose());
		}).not.toThrow();
	});

	it('falls back for an object missing a position coordinate', () => {
		localStorage.setItem('driftpane:adversarial-drag:position', '{"x":42}');
		const {controller} = setup();
		expect(Number.isFinite(controller.getPosition().y)).toBe(true);
	});

	it('a lost pointer capture allows a subsequent gesture without disable/enable', () => {
		const {controller, title} = setup();
		pointer(title, 'pointerdown', 1, 30, 30);
		pointer(title, 'pointermove', 1, 70, 70);
		// Capture can be released/stolen without pointerup on this handle. Its
		// subsequent pointerup is delivered to a different hit-tested element.
		pointer(title, 'lostpointercapture', 1, 70, 70);
		pointer(document.body, 'pointerup', 1, 70, 70);
		const previous = controller.getPosition();
		pointer(title, 'pointerdown', 2, 70, 70);
		pointer(title, 'pointermove', 2, 120, 120);
		pointer(title, 'pointerup', 2, 120, 120);
		expect(controller.getPosition()).not.toEqual(previous);
	});

	it('clamps against the pane owner-document viewport, not its parent window', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		const frame = iframe.contentWindow;
		if (!frame) throw new Error('Missing iframe');
		Object.defineProperties(frame, {
			innerWidth: {value: 320, configurable: true},
			innerHeight: {value: 200, configurable: true},
		});
		const {controller, wrapper} = setup(frame.document);
		controller.setPosition({x: 500, y: 500});
		expect(wrapper.getBoundingClientRect().right).toBeLessThanOrEqual(320);
		expect(wrapper.getBoundingClientRect().bottom).toBeLessThanOrEqual(200);
	});

	it.each([
		'.driftpane-resize-handle',
		'.driftpane-resize-handle-y',
		'.driftpane-resize-handle-corner',
	])('lost capture on %s releases the interaction lock', (selector) => {
		const {controller, title, wrapper} = setup();
		const handle = wrapper.querySelector<HTMLElement>(selector);
		if (!handle) throw new Error('Missing resize handle');
		pointer(handle, 'pointerdown', 1, 280, 100);
		pointer(handle, 'pointermove', 1, 320, 140);
		pointer(handle, 'lostpointercapture', 1, 320, 140);
		pointer(document.body, 'pointerup', 1, 320, 140);
		const before = controller.getPosition();
		pointer(title, 'pointerdown', 2, 30, 30);
		pointer(title, 'pointermove', 2, 80, 80);
		pointer(title, 'pointerup', 2, 80, 80);
		expect(controller.getPosition()).not.toEqual(before);
	});

	it('reacts to resizing the owner window', () => {
		const iframe = document.createElement('iframe');
		document.body.appendChild(iframe);
		const frame = iframe.contentWindow;
		if (!frame) throw new Error('Missing iframe');
		Object.defineProperties(frame, {
			innerWidth: {value: 320, configurable: true},
			innerHeight: {value: 200, configurable: true},
		});
		const {wrapper, controller} = setup(frame.document);
		controller.setPosition({x: 0, y: 0});
		Object.defineProperty(frame, 'innerWidth', {
			value: 180,
			configurable: true,
		});
		frame.dispatchEvent(new Event('resize'));
		expect(wrapper.style.width).toBe('180px');
		expect(controller.getWidth()).toBe(280);
	});

	it('rejects nonfinite public coordinates without poisoning persisted position', () => {
		const {controller} = setup();
		controller.setPosition({x: 30, y: 40});
		controller.setPosition({x: Number.NaN, y: Infinity});
		expect(controller.getPosition()).toEqual({x: 30, y: 40});
		expect(
			JSON.parse(
				localStorage.getItem('driftpane:adversarial-drag:position') ?? '{}',
			),
		).toEqual({x: 30, y: 40});
	});

	it('does not let a second pointer hijack an ongoing drag', () => {
		const {controller, title} = setup();
		pointer(title, 'pointerdown', 1, 30, 30);
		pointer(title, 'pointerdown', 2, 500, 500);
		pointer(title, 'pointermove', 2, 600, 600);
		expect(controller.getPosition()).toEqual({x: 24, y: 24});
		pointer(title, 'pointerup', 2, 600, 600);
		pointer(title, 'pointermove', 1, 60, 60);
		pointer(title, 'pointerup', 1, 60, 60);
		expect(controller.getPosition()).toEqual({x: 54, y: 54});
	});

	it('a pointercancel releases the active gesture so subsequent drag works', () => {
		const {controller, title} = setup();
		pointer(title, 'pointerdown', 1, 30, 30);
		pointer(title, 'pointermove', 1, 70, 70);
		pointer(title, 'pointercancel', 1, 70, 70);
		const previous = controller.getPosition();
		pointer(title, 'pointerdown', 2, 70, 70);
		pointer(title, 'pointermove', 2, 120, 120);
		pointer(title, 'pointerup', 2, 120, 120);
		expect(controller.getPosition()).not.toEqual(previous);
	});
});
