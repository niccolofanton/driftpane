import {readFileSync} from 'node:fs';

import {Pane} from 'tweakpane';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

const skin = readFileSync('theme.css', 'utf8');

describe('theme stylesheet integration with native Tweakpane', () => {
	let pane: Pane;

	beforeEach(() => {
		document.body.innerHTML = '';
		document.documentElement.removeAttribute('data-theme');
		pane = new Pane({title: 'Theme'});
		const style = document.createElement('style');
		style.dataset.testSkin = '';
		style.textContent = skin;
		document.head.append(style);
	});

	afterEach(() => {
		pane.dispose();
		document.documentElement.removeAttribute('data-theme');
		document.querySelector('style[data-test-skin]')?.remove();
	});

	it('applies the light shadow to the pane itself, where the theme controller writes the attribute', () => {
		pane.element.dataset.theme = 'dark';
		const dark = getComputedStyle(pane.element).boxShadow;
		pane.element.dataset.theme = 'light';
		const light = getComputedStyle(pane.element).boxShadow;
		expect(light).toContain('0 10px 30px');
		expect(light).not.toBe(dark);
	});

	it('inherits ancestor light styling only when no explicit pane theme overrides it', () => {
		document.documentElement.dataset.theme = 'light';
		expect(getComputedStyle(pane.element).boxShadow).toContain('0 10px 30px');
		pane.element.dataset.theme = 'dark';
		expect(getComputedStyle(pane.element).boxShadow).not.toContain(
			'0 10px 30px',
		);
	});
});
