import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane} from '../src/driftpane.js';
import {SerializedState} from '../src/types.js';
import {decodeEnvelope, encodeEnvelope} from '../src/url-share.js';
import {FakePane} from './helpers/fake-pane.js';

function liveState(speed = 0.5): SerializedState {
	return {
		expanded: true,
		children: [{binding: {key: 'speed', value: speed}}],
	};
}

/** Polls until `cond()` is truthy or the timeout elapses. */
async function waitFor(cond: () => boolean, timeout = 1000): Promise<void> {
	const start = Date.now();
	while (!cond()) {
		if (Date.now() - start > timeout) {
			throw new Error('waitFor: timed out');
		}
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

const NS = 'app';

describe('URL share — end-to-end flow', () => {
	beforeEach(() => {
		localStorage.clear();
		document.head.innerHTML = '';
		document.body.innerHTML = '';
		window.history.replaceState({}, '', '/');
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('opening a shared link previews the config and imports it on accept', async () => {
		// --- Sender: build a link that carries a MODIFIED config -------------
		const senderPane = new FakePane({initialState: liveState(0.5)});
		const sender = createDriftpane(senderPane, {storageNamespace: NS});
		// Mutate the live value so the shared snapshot differs from the receiver's
		// factory Default (children[0] is the speed binding; [1] is the folder).
		(
			senderPane.state.children as Array<{binding: {value: number}}>
		)[0].binding.value = 0.99;
		const url = await sender.shareUrl();
		sender.dispose();
		expect(url).toContain('=');

		// --- Receiver: fresh store, open the link ---------------------------
		localStorage.clear();
		window.history.replaceState({}, '', url);
		const receiverPane = new FakePane({initialState: liveState(0.5)});
		const receiver = createDriftpane(receiverPane, {storageNamespace: NS});

		await waitFor(
			() => receiverPane.element.querySelector('.dp-share-card') !== null,
		);

		// Preview applied: the receiver pane already shows the shared value.
		const previewed = receiverPane.exportState().children as Array<{
			binding?: {value: unknown};
		}>;
		expect(previewed[0].binding?.value).toBe(0.99);

		// Accept the import.
		const before = receiver.presets.list().length;
		(
			receiverPane.element.querySelector(
				'.dp-share-btn-primary',
			) as HTMLElement | null
		)?.click();

		const imported = receiver.presets
			.list()
			.find((p) => p.name === 'Default (imported)');
		expect(imported).toBeDefined();
		expect(receiver.presets.list().length).toBe(before + 1);
		expect(receiver.presets.activeId()).toBe(imported?.id);

		receiver.dispose();
	});

	it('discarding a shared link reverts to the local state and clears the param', async () => {
		const senderPane = new FakePane({initialState: liveState(0.5)});
		const sender = createDriftpane(senderPane, {storageNamespace: NS});
		(
			senderPane.state.children as Array<{binding: {value: number}}>
		)[0].binding.value = 0.99;
		const url = await sender.shareUrl();
		sender.dispose();

		localStorage.clear();
		window.history.replaceState({}, '', url);
		const receiverPane = new FakePane({initialState: liveState(0.5)});
		const receiver = createDriftpane(receiverPane, {storageNamespace: NS});

		await waitFor(
			() => receiverPane.element.querySelector('.dp-share-card') !== null,
		);

		const before = receiver.presets.list().length;
		(
			receiverPane.element.querySelector(
				'.dp-share-btn-ghost',
			) as HTMLElement | null
		)?.click();

		// Reverted to the local value, no preset added, param removed.
		const reverted = receiverPane.exportState().children as Array<{
			binding?: {value: unknown};
		}>;
		expect(reverted[0].binding?.value).toBe(0.5);
		expect(receiver.presets.list().length).toBe(before);
		expect(
			new URLSearchParams(window.location.search).get(`dp:${NS}`),
		).toBeNull();

		receiver.dispose();
	});

	it('keeps preset actions disabled until an incoming preview is resolved', async () => {
		const encoded = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			n: 'Remote',
			d: true,
			s: liveState(0.9),
		});
		window.history.replaceState({}, '', `/?dp:${NS}=${encoded}`);
		const pane = new FakePane({initialState: liveState(0.5)});
		const drift = createDriftpane(pane, {storageNamespace: NS});
		await waitFor(() => pane.element.querySelector('.dp-share-card') !== null);
		const count = drift.presets.list().length;
		pane.children[0].button('Save as new')?.click();
		expect(pane.element.querySelector('.dp-name-editor')).toBeNull();
		expect(drift.presets.list()).toHaveLength(count);
		(pane.element.querySelector('.dp-share-btn-ghost') as HTMLElement).click();
		pane.children[0].button('Save as new')?.click();
		expect(pane.element.querySelector('.dp-name-editor')).not.toBeNull();
		drift.dispose();
	});

	it('restores local values when disposed during an incoming preview', async () => {
		const encoded = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			n: 'Remote',
			d: true,
			s: liveState(0.9),
		});
		window.history.replaceState({}, '', `/?dp:${NS}=${encoded}`);
		const pane = new FakePane({initialState: liveState(0.5)});
		const drift = createDriftpane(pane, {storageNamespace: NS});
		await waitFor(() => pane.element.querySelector('.dp-share-card') !== null);
		expect(
			(pane.exportState().children as Array<{binding: {value: number}}>)[0]
				.binding.value,
		).toBe(0.9);
		drift.dispose();
		expect(
			(pane.exportState().children as Array<{binding: {value: number}}>)[0]
				.binding.value,
		).toBe(0.5);
	});

	it('exports local state rather than unaccepted preview values', async () => {
		const encoded = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			n: 'Remote',
			d: true,
			s: liveState(0.9),
		});
		window.history.replaceState({}, '', `/?dp:${NS}=${encoded}`);
		const pane = new FakePane({initialState: liveState(0.5)});
		const drift = createDriftpane(pane, {storageNamespace: NS});
		await waitFor(() => pane.element.querySelector('.dp-share-card') !== null);
		const backup = JSON.parse(drift.exportAllJSON());
		expect(backup.data.state.children[0].binding.value).toBe(0.5);
		expect(localStorage.getItem(`driftpane:${NS}:state`)).toBeNull();
		drift.dispose();
	});

	it('clearShareUrl discards an active incoming preview', async () => {
		const encoded = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			n: 'Remote',
			d: true,
			s: liveState(0.9),
		});
		window.history.replaceState({}, '', `/?dp:${NS}=${encoded}`);
		const pane = new FakePane({initialState: liveState(0.5)});
		const drift = createDriftpane(pane, {storageNamespace: NS});
		await waitFor(() => pane.element.querySelector('.dp-share-card') !== null);
		drift.clearShareUrl();
		expect(
			(pane.exportState().children as Array<{binding: {value: number}}>)[0]
				.binding.value,
		).toBe(0.5);
		expect(pane.element.querySelector('.dp-share-card')).toBeNull();
		expect(new URLSearchParams(window.location.search).has(`dp:${NS}`)).toBe(
			false,
		);
		expect(() => drift.savePresetAs('Local')).not.toThrow();
		drift.dispose();
	});

	it.each(['__none__', '', '   '])(
		'normalizes reserved or blank shared preset id %j',
		async (id) => {
			const encoded = await encodeEnvelope({
				f: 'driftpane-share',
				v: 1,
				id,
				n: 'Remote',
				d: false,
				s: liveState(0.9),
			});
			window.history.replaceState({}, '', `/?dp:${NS}=${encoded}`);
			const pane = new FakePane({initialState: liveState(0.5)});
			const drift = createDriftpane(pane, {storageNamespace: NS});
			await waitFor(
				() => pane.element.querySelector('.dp-share-card') !== null,
			);
			const defaultId = drift.presets.activeId() as string;
			(
				pane.element.querySelector('.dp-share-btn-primary') as HTMLElement
			).click();
			const importedId = drift.presets.activeId() as string;
			expect(importedId.trim()).not.toBe('');
			expect(importedId).not.toBe('__none__');
			expect(drift.presets.activeName()).toBe('Remote (imported)');
			pane.children[0].list()?.select(defaultId);
			pane.children[0].list()?.select(importedId);
			expect(drift.presets.activeId()).toBe(importedId);
			expect(
				(pane.exportState().children as Array<{binding: {value: number}}>)[0]
					.binding.value,
			).toBe(0.9);
			drift.dispose();
		},
	);

	it('reconciles a different preset identity even when values are identical', async () => {
		const initialPane = new FakePane({initialState: liveState(0.5)});
		const initial = createDriftpane(initialPane, {storageNamespace: NS});
		const local = initial.presets.save('Local');
		const state = initial.presets.currentSnapshot();
		initial.dispose();
		const encoded = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			id: 'remote-preset-id',
			n: 'Remote',
			d: false,
			s: state,
		});
		window.history.replaceState({}, '', `/?dp:${NS}=${encoded}`);
		const pane = new FakePane({initialState: liveState(0.5)});
		const receiver = createDriftpane(pane, {storageNamespace: NS});
		await waitFor(() => pane.element.querySelector('.dp-share-card') !== null);
		expect(
			pane.element.querySelector('.dp-share-card-msg')?.textContent,
		).toContain('new preset');
		expect(receiver.presets.activeId()).toBe(local.id);
		(
			pane.element.querySelector('.dp-share-btn-primary') as HTMLElement
		).click();
		expect(receiver.presets.activeId()).toBe('remote-preset-id');
		expect(receiver.presets.activeName()).toBe('Remote');
		receiver.dispose();
	});

	it('explains that an identical local preset may be reused on import', async () => {
		const encoded = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			n: 'Remote Default',
			d: true,
			s: liveState(0.5),
		});
		window.history.replaceState({}, '', `/?dp:${NS}=${encoded}`);
		const pane = new FakePane({initialState: liveState(0.5)});
		const drift = createDriftpane(pane, {storageNamespace: NS});
		await waitFor(() => pane.element.querySelector('.dp-share-card') !== null);
		expect(
			pane.element.querySelector('.dp-share-card-msg')?.textContent,
		).toContain('identical local preset');
		(
			pane.element.querySelector('.dp-share-btn-primary') as HTMLElement
		).click();
		expect(drift.presets.list()).toHaveLength(1);
		expect(drift.presets.activeName()).toBe('Default');
		drift.dispose();
	});

	it('skips the prompt when reopening its own URL with the same preset', async () => {
		const pane = new FakePane({initialState: liveState(0.5)});
		const first = createDriftpane(pane, {storageNamespace: NS});
		const preset = first.presets.save('Local');
		const url = await first.shareUrl();
		first.dispose();
		window.history.replaceState({}, '', url);
		const reloadedPane = new FakePane({initialState: liveState(0.5)});
		const reloaded = createDriftpane(reloadedPane, {storageNamespace: NS});
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(reloadedPane.element.querySelector('.dp-share-card')).toBeNull();
		expect(reloaded.presets.activeId()).toBe(preset.id);
		reloaded.dispose();
	});

	it('refreshes an old URL name for the same custom preset without prompting', async () => {
		const pane = new FakePane({initialState: liveState(0.5)});
		const first = createDriftpane(pane, {storageNamespace: NS});
		const preset = first.presets.save('Old');
		first.presets.rename(preset.id, 'New');
		const encoded = await encodeEnvelope({
			f: 'driftpane-share',
			v: 1,
			id: preset.id,
			n: 'Old',
			d: false,
			s: first.presets.currentSnapshot(),
		});
		first.dispose();
		window.history.replaceState({}, '', `/?dp:${NS}=${encoded}`);
		const reloadedPane = new FakePane({initialState: liveState(0.5)});
		const reloaded = createDriftpane(reloadedPane, {storageNamespace: NS});
		await waitFor(
			() =>
				new URLSearchParams(window.location.search).get(`dp:${NS}`) !== encoded,
		);
		expect(reloadedPane.element.querySelector('.dp-share-card')).toBeNull();
		const updated = new URLSearchParams(window.location.search).get(`dp:${NS}`);
		const env = await decodeEnvelope(updated ?? '');
		expect(env).toMatchObject({id: preset.id, n: 'New'});
		reloaded.dispose();
	});

	it('does not touch the URL when urlSync is disabled', async () => {
		const pane = new FakePane({initialState: liveState()});
		const drift = createDriftpane(pane, {storageNamespace: NS, urlSync: false});
		const url = await drift.shareUrl();
		// shareUrl falls back to the current location and writes nothing.
		expect(
			new URLSearchParams(window.location.search).get(`dp:${NS}`),
		).toBeNull();
		expect(typeof url).toBe('string');
		drift.dispose();
	});
});
