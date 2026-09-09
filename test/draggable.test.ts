import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {DRAG_HANDLE_SELECTOR, DraggableController} from '../src/draggable.js';
import {DriftpaneStorage} from '../src/storage.js';

interface PaneLike {
	element: HTMLElement;
}

function makePane(): PaneLike {
	const el = document.createElement('div');
	const handle = document.createElement('div');
	handle.className = 'tp-rotv_b';
	el.appendChild(handle);
	document.body.appendChild(el);
	return {element: el};
}

/** Force a deterministic container size so clamp math is testable. */
function stubRect(width: number, height: number): void {
	vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
		x: 0,
		y: 0,
		left: 0,
		top: 0,
		right: width,
		bottom: height,
		width,
		height,
		toJSON: () => ({}),
	} as DOMRect);
}

describe('DraggableController', () => {
	let pane: PaneLike;
	let storage: DriftpaneStorage;

	beforeEach(() => {
		localStorage.clear();
		document.body.innerHTML = '';
		pane = makePane();
		storage = new DriftpaneStorage('drag-test');
		// A roomy viewport so default positions are not clamped to 0.
		(window as unknown as {innerWidth: number}).innerWidth = 1000;
		(window as unknown as {innerHeight: number}).innerHeight = 800;
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('uses the documented drag-handle selector', () => {
		expect(DRAG_HANDLE_SELECTOR).toBe('.tp-rotv_b');
	});

	it('starts at the default position when storage is empty', () => {
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
		});
		expect(ctrl.getPosition()).toEqual({x: 8, y: 8});
	});

	it('loads a saved position from storage', () => {
		storage.writeJSON('position', {x: 120, y: 60});
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: false,
			defaultPosition: {x: 0, y: 0},
		});
		expect(ctrl.getPosition()).toEqual({x: 120, y: 60});
	});

	it('setPosition persists the position (round-trip)', () => {
		stubRect(200, 100);
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 0, y: 0},
		});
		ctrl.enable();
		ctrl.setPosition({x: 150, y: 90});
		expect(storage.readJSON('position', null)).toEqual({x: 150, y: 90});
		// A fresh controller reads back the same persisted position.
		const reloaded = new DraggableController(pane, storage, {
			clampToViewport: false,
			defaultPosition: {x: 0, y: 0},
		});
		expect(reloaded.getPosition()).toEqual({x: 150, y: 90});
	});

	it('clamps the position to the viewport bounds', () => {
		stubRect(200, 100); // container is 200x100
		(window as unknown as {innerWidth: number}).innerWidth = 500;
		(window as unknown as {innerHeight: number}).innerHeight = 400;
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 0, y: 0},
		});
		ctrl.enable();
		// Way off-screen => clamped to (vw-width, vh-height) = (300, 300).
		ctrl.setPosition({x: 9999, y: 9999});
		expect(ctrl.getPosition()).toEqual({x: 300, y: 300});
		// Negative => clamped to 0.
		ctrl.setPosition({x: -50, y: -50});
		expect(ctrl.getPosition()).toEqual({x: 0, y: 0});
	});

	it('does NOT clamp when clampToViewport is false', () => {
		stubRect(200, 100);
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: false,
			defaultPosition: {x: 0, y: 0},
		});
		ctrl.enable();
		ctrl.setPosition({x: 9999, y: 9999});
		expect(ctrl.getPosition()).toEqual({x: 9999, y: 9999});
	});

	it('resetPosition returns to the default position', () => {
		stubRect(200, 100);
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
		});
		ctrl.enable();
		ctrl.setPosition({x: 100, y: 100});
		ctrl.resetPosition();
		expect(ctrl.getPosition()).toEqual({x: 8, y: 8});
	});

	it('enable() wraps the pane element in a fixed container', () => {
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
		});
		ctrl.enable();
		const container = document.querySelector('.driftpane-drag-container');
		expect(container).not.toBeNull();
		expect((container as HTMLElement).style.position).toBe('fixed');
		expect(container?.contains(pane.element)).toBe(true);
		// A resize handle is added.
		expect(container?.querySelector('.driftpane-resize-handle')).not.toBeNull();
	});

	it('creates all handles by default (width + height + corner)', () => {
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
		});
		ctrl.enable();
		const container = document.querySelector('.driftpane-drag-container');
		expect(container?.querySelector('.driftpane-resize-handle')).not.toBeNull();
		expect(
			container?.querySelector('.driftpane-resize-handle-y'),
		).not.toBeNull();
		// The corner (hor+vert resize together) exists only if BOTH axes are ok.
		expect(
			container?.querySelector('.driftpane-resize-handle-corner'),
		).not.toBeNull();
	});

	it('does NOT create the corner handle if one axis is disabled', () => {
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
			resizableHeight: false,
		});
		ctrl.enable();
		const container = document.querySelector('.driftpane-drag-container');
		expect(
			container?.querySelector('.driftpane-resize-handle-corner'),
		).toBeNull();
	});

	it('does NOT create the width handle when resizableWidth is false', () => {
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
			resizableWidth: false,
		});
		ctrl.enable();
		const container = document.querySelector('.driftpane-drag-container');
		expect(container?.querySelector('.driftpane-resize-handle')).toBeNull();
		// the height one stays (default true)
		expect(
			container?.querySelector('.driftpane-resize-handle-y'),
		).not.toBeNull();
	});

	it('does NOT create the height handle when resizableHeight is false', () => {
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
			resizableHeight: false,
		});
		ctrl.enable();
		const container = document.querySelector('.driftpane-drag-container');
		expect(container?.querySelector('.driftpane-resize-handle-y')).toBeNull();
		expect(container?.querySelector('.driftpane-resize-handle')).not.toBeNull();
	});

	it('uses the initial width (opts.width) when storage is empty', () => {
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
			width: 320,
		});
		ctrl.enable();
		const container = document.querySelector(
			'.driftpane-drag-container',
		) as HTMLElement;
		expect(container.style.width).toBe('320px');
	});

	it('enable() is idempotent', () => {
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
		});
		ctrl.enable();
		ctrl.enable();
		expect(document.querySelectorAll('.driftpane-drag-container')).toHaveLength(
			1,
		);
	});

	it('clamps a saved width into the [200, 600] range', () => {
		storage.writeJSON('width', 5000);
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
		});
		ctrl.enable();
		const container = document.querySelector(
			'.driftpane-drag-container',
		) as HTMLElement;
		expect(container.style.width).toBe('600px');
	});

	it('dispose() / disable() can be called safely', () => {
		const ctrl = new DraggableController(pane, storage, {
			clampToViewport: true,
			defaultPosition: {x: 8, y: 8},
		});
		ctrl.enable();
		expect(() => ctrl.dispose()).not.toThrow();
		// disable() again is a no-op.
		expect(() => ctrl.disable()).not.toThrow();
	});
});
