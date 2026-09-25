import {Pane} from 'tweakpane';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';

import {createDriftpane, Driftpane} from '../src/driftpane.js';
import {stripExpanded, stripReadonly} from '../src/state-scope.js';
import {encodeEnvelope} from '../src/url-share.js';
const sessions: Array<{pane: Pane; drift: Driftpane}> = [];
const ns = 'adversarial-url';
beforeEach(() => {
	localStorage.clear();
	window.history.replaceState({}, '', '/');
	vi.useFakeTimers();
	vi.stubGlobal('CompressionStream', undefined);
});
afterEach(() => {
	sessions.forEach((s) => {
		s.drift.dispose();
		s.pane.dispose();
	});
	sessions.length = 0;
	vi.unstubAllGlobals();
	vi.useRealTimers();
});
function make() {
	const pane = new Pane();
	const values = {speed: 1, monitor: 42};
	pane.addBinding(values, 'speed');
	pane.addBinding(values, 'monitor', {readonly: true});
	const drift = createDriftpane(pane, {
		storageNamespace: ns,
		draggable: false,
		debounceMs: 20,
	});
	sessions.push({pane, drift});
	return {pane, values, drift};
}
async function incoming() {
	const source = new Pane();
	const values = {speed: 9, monitor: 42};
	source.addBinding(values, 'speed');
	source.addBinding(values, 'monitor', {readonly: true});
	const payload = await encodeEnvelope({
		f: 'driftpane-share',
		v: 1,
		n: 'Incoming',
		d: true,
		s: stripReadonly(stripExpanded(source.exportState())),
	});
	source.dispose();
	window.history.replaceState({}, '', `/?dp:${ns}=${payload}`);
	const receiver = make();
	await vi.advanceTimersByTimeAsync(0);
	return receiver;
}
it('preview imports editable values while preserving local readonly monitors', async () => {
	const {pane, values} = await incoming();
	expect(values.speed).toBe(9);
	expect(values.monitor).toBe(42);
	expect(pane.element.querySelector('.dp-share-card')).not.toBeNull();
});
it('copying a link during the preview does not replace the incoming URL', async () => {
	const {drift} = await incoming();
	const incomingUrl = window.location.href;
	expect(await drift.copyShareLink()).toBe(incomingUrl);
	expect(await drift.shareUrl()).toBe(incomingUrl);
	expect(window.location.href).toBe(incomingUrl);
});
it('rejecting backup while previewing must keep persistence paused', async () => {
	const {pane, values, drift} = await incoming();
	const previous = localStorage.getItem(`driftpane:${ns}:state`);
	expect(values.speed).toBe(9);
	expect(pane.element.querySelector('.dp-share-card')).not.toBeNull();
	expect(() =>
		drift.importAllJSON(
			JSON.stringify({
				format: 'driftpane-backup',
				version: 1,
				data: {presets: {presets: [null]}},
			}),
		),
	).toThrow();
	await vi.advanceTimersByTimeAsync(40);
	expect(localStorage.getItem(`driftpane:${ns}:state`)).toBe(previous);
});
it('rejects preset changes while previewing so discard keeps the local identity', async () => {
	const {pane, values, drift} = await incoming();
	const id = drift.presets.activeId();
	values.speed = 5;
	pane.refresh();
	expect(() => drift.savePresetAs('Five')).toThrow();
	expect(() => drift.presets.save('Five')).toThrow();
	expect(drift.presets.activeId()).toBe(id);
	(pane.element.querySelector('.dp-share-btn-ghost') as HTMLElement).click();
	expect(drift.presets.activeId()).toBe(id);
	expect(values.speed).toBe(1);
});
it.each(['hidden', 'disabled'] as const)(
	'a %s sender must keep the recipient confirmation usable',
	async (field) => {
		const source = new Pane();
		const values = {speed: 9, monitor: 42};
		source.addBinding(values, 'speed');
		source.addBinding(values, 'monitor', {readonly: true});
		source[field] = true;
		const payload = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			n: 'Incoming',
			d: true,
			s: stripReadonly(stripExpanded(source.exportState())),
		});
		source.dispose();
		window.history.replaceState({}, '', `/?dp:${ns}=${payload}`);
		const {pane} = make();
		await vi.advanceTimersByTimeAsync(0);
		expect(pane[field]).toBe(false);
	},
);
it('copying twice while encoding must return a share link from both calls', async () => {
	const {drift} = make();
	const [first, second] = await Promise.all([
		drift.copyShareLink(),
		drift.copyShareLink(),
	]);
	expect(new URL(second).searchParams.has(`dp:${ns}`)).toBe(true);
	expect(new URL(first).searchParams.has(`dp:${ns}`)).toBe(true);
});
it('clearing the incoming URL while decoding cancels the pending preview', async () => {
	const source = new Pane();
	const values = {speed: 9, monitor: 42};
	source.addBinding(values, 'speed');
	source.addBinding(values, 'monitor', {readonly: true});
	const payload = await encodeEnvelope({
		f: 'driftpane-share',
		v: 1,
		n: 'Incoming',
		d: true,
		s: stripReadonly(stripExpanded(source.exportState())),
	});
	source.dispose();
	window.history.replaceState({}, '', `/?dp:${ns}=${payload}`);
	const receiver = make();
	receiver.drift.clearShareUrl();
	await vi.advanceTimersByTimeAsync(0);
	expect(receiver.values.speed).toBe(1);
	expect(receiver.pane.element.querySelector('.dp-share-card')).toBeNull();
});
it('clearing superseded concurrent writes cancels both results without deadlock', async () => {
	const {drift} = make();
	const first = drift.copyShareLink();
	const second = drift.copyShareLink();
	drift.clearShareUrl();
	const results = await Promise.all([first, second]);
	expect(
		results.every((url) => !new URL(url).searchParams.has(`dp:${ns}`)),
	).toBe(true);
});
