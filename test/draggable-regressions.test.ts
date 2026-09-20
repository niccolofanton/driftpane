import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DraggableController} from '../src/draggable.js';
import {DriftpaneStorage} from '../src/storage.js';

describe('draggable geometry and lifecycle regressions', () => {
	let pane: {element: HTMLElement};
	let storage: DriftpaneStorage;
	let controller: DraggableController;
	let naturalHeight: number;
	let notifyResize: () => void;
	let disconnect: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		document.body.innerHTML = '';
		localStorage.clear();
		window.innerWidth = 1000;
		window.innerHeight = 800;
		naturalHeight = 300;
		disconnect = vi.fn();
		vi.stubGlobal(
			'ResizeObserver',
			class {
				constructor(callback: () => void) {
					notifyResize = callback;
				}
				observe() {}
				disconnect = disconnect;
			},
		);
		pane = {element: document.createElement('div')};
		pane.element.className = 'tp-rotv tp-rotv-expanded';
		pane.element.innerHTML = '<button class="tp-rotv_b">Title</button>';
		document.body.append(pane.element);
		storage = new DriftpaneStorage('geometry');
		// jsdom has no layout: model the dimensions that browser layout supplies
		// while exercising actual pointer listeners, storage and controller APIs.
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
			function (this: HTMLElement) {
				const width = Number.parseFloat(this.style.width) || 280;
				const height = Math.min(
					naturalHeight,
					Number.parseFloat(
						pane.element.style.getPropertyValue('--dp-max-height'),
					) || Infinity,
				);
				const left = Number.parseFloat(this.style.left) || 0;
				const top = Number.parseFloat(this.style.top) || 0;
				return {
					x: left,
					y: top,
					left,
					top,
					right: left + width,
					bottom: top + height,
					width,
					height,
					toJSON: () => ({}),
				};
			},
		);
		controller = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 24, y: 24},
		});
		controller.enable();
	});

	afterEach(() => {
		controller.dispose();
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	function pointer(selector: string, type: string, x = 0, y = 0) {
		const event = new MouseEvent(type, {
			clientX: x,
			clientY: y,
			bubbles: true,
			cancelable: true,
		});
		Object.defineProperties(event, {
			pointerId: {value: 1},
			pointerType: {value: 'mouse'},
		});
		(document.querySelector(selector) as HTMLElement).dispatchEvent(event);
	}

	it('reuses one wrapper and one set of working handles after disable/enable', () => {
		const wrapper = pane.element.parentElement;
		controller.disable();
		expect(disconnect).toHaveBeenCalledOnce();
		expect(document.querySelector('.driftpane-resize-handle')).toBeNull();
		controller.enable();
		expect(pane.element.parentElement).toBe(wrapper);
		expect(document.querySelectorAll('.driftpane-drag-container')).toHaveLength(
			1,
		);
		expect(document.querySelectorAll('.driftpane-resize-handle')).toHaveLength(
			1,
		);
		pointer('.driftpane-resize-handle', 'pointerdown', 280);
		pointer('.driftpane-resize-handle', 'pointermove', 320);
		pointer('.driftpane-resize-handle', 'pointerup', 320);
		expect(controller.getWidth()).toBe(320);
		expect(storage.readJSON('width', null)).toBe(320);
	});

	it('releases capture and clears unfinished drag state when disabled', () => {
		const title = pane.element.querySelector<HTMLElement>(
			'.tp-rotv_b',
		) as HTMLElement;
		const release = vi.fn();
		title.releasePointerCapture = release;
		pointer('.tp-rotv_b', 'pointerdown', 30, 30);
		pointer('.tp-rotv_b', 'pointermove', 100, 100);
		controller.disable();
		expect(release).toHaveBeenCalledWith(1);
		controller.enable();
		const click = new MouseEvent('click', {bubbles: true, cancelable: true});
		title.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(false);
		const position = controller.getPosition();
		pointer('.tp-rotv_b', 'pointermove', 200, 200);
		expect(controller.getPosition()).toEqual(position);
	});

	it.each(['.driftpane-resize-handle-y', '.driftpane-resize-handle-corner'])(
		'a click on %s preserves the chosen height',
		(handle) => {
			storage.writeJSON('maxHeight', '600px');
			pane.element.style.setProperty('--dp-max-height', '600px');
			pointer(handle, 'pointerdown', 280, 300);
			pointer(handle, 'pointermove', 280, 300);
			pointer(handle, 'pointerup', 280, 300);
			expect(storage.readJSON('maxHeight', null)).toBe('600px');
			expect(pane.element.style.getPropertyValue('--dp-max-height')).toBe(
				'600px',
			);
		},
	);

	it('collapsed bottom and corner gestures preserve the expanded height cap', () => {
		storage.writeJSON('maxHeight', '600px');
		pane.element.style.setProperty('--dp-max-height', '600px');
		pane.element.classList.remove('tp-rotv-expanded');
		naturalHeight = 36;
		pointer('.driftpane-resize-handle-y', 'pointerdown', 0, 36);
		pointer('.driftpane-resize-handle-y', 'pointermove', 0, 100);
		pointer('.driftpane-resize-handle-y', 'pointerup', 0, 100);
		pointer('.driftpane-resize-handle-corner', 'pointerdown', 280, 36);
		pointer('.driftpane-resize-handle-corner', 'pointermove', 320, 100);
		pointer('.driftpane-resize-handle-corner', 'pointerup', 320, 100);
		expect(controller.getWidth()).toBe(320);
		expect(storage.readJSON('maxHeight', null)).toBe('600px');
		expect(pane.element.style.getPropertyValue('--dp-max-height')).toBe(
			'600px',
		);
	});

	it('horizontal corner resizing does not shrink an expanded pane cap to its natural height', () => {
		storage.writeJSON('maxHeight', '600px');
		pane.element.style.setProperty('--dp-max-height', '600px');
		pointer('.driftpane-resize-handle-corner', 'pointerdown', 280, 300);
		pointer('.driftpane-resize-handle-corner', 'pointermove', 320, 300);
		pointer('.driftpane-resize-handle-corner', 'pointerup', 320, 300);
		expect(storage.readJSON('maxHeight', null)).toBe('600px');
	});

	it.each(['.driftpane-resize-handle-y', '.driftpane-resize-handle-corner'])(
		'growing %s keeps the panel visible and persists its adjusted position',
		(handle) => {
			naturalHeight = 700;
			pane.element.style.setProperty('--dp-max-height', '300px');
			controller.setPosition({x: 24, y: 500});
			pointer(handle, 'pointerdown', 280, 800);
			pointer(handle, 'pointermove', 280, 900);
			pointer(handle, 'pointerup', 280, 900);
			expect(
				(pane.element.parentElement as HTMLElement).getBoundingClientRect()
					.bottom,
			).toBeLessThanOrEqual(window.innerHeight);
			expect(storage.readJSON('position', null)).toEqual({x: 24, y: 400});
			expect(storage.readJSON('maxHeight', null)).toBe('400px');
		},
	);

	it('fits saved width into a narrow viewport without losing its preference', () => {
		controller.dispose();
		window.innerWidth = 375;
		storage.writeJSON('width', 600);
		const secondPane = {element: document.createElement('div')};
		document.body.append(secondPane.element);
		controller = new DraggableController(secondPane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 24, y: 24},
		});
		controller.enable();
		expect(secondPane.element.parentElement?.style.width).toBe('375px');
		expect(controller.getWidth()).toBe(600);
		window.innerWidth = 1000;
		window.dispatchEvent(new Event('resize'));
		expect(secondPane.element.parentElement?.style.width).toBe('600px');
		expect(storage.readJSON('width', null)).toBe(600);
	});

	it('setWidth persists a preference and adapts even below the usual minimum', () => {
		window.innerWidth = 180;
		controller.setWidth(450);
		expect(pane.element.parentElement?.style.width).toBe('180px');
		expect(controller.getWidth()).toBe(450);
		expect(storage.readJSON('width', null)).toBe(450);
		window.innerWidth = 800;
		window.dispatchEvent(new Event('resize'));
		expect(pane.element.parentElement?.style.width).toBe('450px');
	});

	it('a corner click on a constrained viewport does not replace the preferred width', () => {
		controller.setWidth(600);
		window.innerWidth = 375;
		window.dispatchEvent(new Event('resize'));
		pointer('.driftpane-resize-handle-corner', 'pointerdown', 375, 300);
		pointer('.driftpane-resize-handle-corner', 'pointerup', 375, 300);
		expect(controller.getWidth()).toBe(600);
		expect(storage.readJSON('width', null)).toBe(600);
	});

	it('reclamps after content expansion without repeatedly writing on observer notifications', () => {
		controller.setPosition({x: 24, y: 500});
		const write = vi.spyOn(storage, 'writeJSON');
		naturalHeight = 700;
		notifyResize();
		expect(controller.getPosition()).toEqual({x: 24, y: 100});
		expect(write).toHaveBeenCalledOnce();
		notifyResize();
		expect(write).toHaveBeenCalledOnce();
		controller.disable();
		naturalHeight = 780;
		notifyResize();
		expect(controller.getPosition()).toEqual({x: 24, y: 100});
	});
	it('notifies the popup layer only when the effective position changes', () => {
		const layout = vi.fn();
		pane.element.addEventListener('driftpane-layout', layout);
		controller.setPosition({x: 100, y: 100});
		expect(layout).toHaveBeenCalledOnce();
		controller.setPosition({x: 100, y: 100});
		expect(layout).toHaveBeenCalledOnce();
		controller.setPosition({x: 9999, y: 9999});
		expect(layout).toHaveBeenCalledTimes(2);
		controller.setPosition({x: 9999, y: 9999});
		expect(layout).toHaveBeenCalledTimes(2);
	});
	it('updates popup geometry when width changes without moving the panel', () => {
		const layout = vi.fn();
		pane.element.addEventListener('driftpane-layout', layout);
		controller.setWidth(450);
		expect(controller.getPosition()).toEqual({x: 24, y: 24});
		expect(layout).toHaveBeenCalledOnce();
		controller.setWidth(450);
		expect(layout).toHaveBeenCalledOnce();
	});
});
