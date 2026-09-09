import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {createDriftpane} from '../src/driftpane.js';
import {SerializedState} from '../src/types.js';
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
