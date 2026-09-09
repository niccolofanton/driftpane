import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {
	DriftpaneShareEnvelope,
	DriftpaneShareIdentity,
	SerializedState,
} from '../src/types.js';
import {
	decodeEnvelope,
	encodeEnvelope,
	ShareReadResult,
	UrlShareController,
} from '../src/url-share.js';

/** A pane that only needs the `change` event for url-share. */
const stubPane = {on: (): unknown => undefined};

const PARAM = 'dp:test';

function controller(
	getSnapshot: () => SerializedState,
	getIdentity: () => DriftpaneShareIdentity | null,
): UrlShareController {
	return new UrlShareController(stubPane, {
		paramKey: PARAM,
		debounceMs: 0,
		getSnapshot,
		getIdentity,
	});
}

function setLocation(search: string, hash = ''): void {
	window.history.replaceState({}, '', `/${search}${hash}`);
}

describe('UrlShareController', () => {
	beforeEach(() => {
		setLocation('');
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('round-trips a custom-preset envelope through the URL', async () => {
		const snapshot: SerializedState = {
			children: [{binding: {key: 'speed', value: 0.5}}],
		};
		const ctrl = controller(
			() => snapshot,
			() => ({id: 'uuid-1', name: 'Sunset', isDefault: false}),
		);

		const url = await ctrl.writeNow();
		expect(url).toContain(`${encodeURIComponent(PARAM)}=`);
		expect(ctrl.hasIncomingParam()).toBe(true);

		const result = await ctrl.readIncoming();
		expect(result.kind).toBe('envelope');
		const env = (result as Extract<ShareReadResult, {kind: 'envelope'}>).env;
		expect(env.id).toBe('uuid-1');
		expect(env.n).toBe('Sunset');
		expect(env.d).toBe(false);
		expect(env.s).toEqual(snapshot);
	});

	it('omits the id and sets d=true for a default (name-marker) identity', async () => {
		const ctrl = controller(
			() => ({children: []}),
			() => ({name: 'Default', isDefault: true}),
		);
		await ctrl.writeNow();
		const result = await ctrl.readIncoming();
		const env = (result as Extract<ShareReadResult, {kind: 'envelope'}>).env;
		expect(env.d).toBe(true);
		expect(env.id).toBeUndefined();
		expect(env.n).toBe('Default');
	});

	it('preserves other query params and the hash when writing', async () => {
		setLocation('?foo=bar&baz=1', '#section');
		const ctrl = controller(
			() => ({children: []}),
			() => ({name: 'Default', isDefault: true}),
		);
		await ctrl.writeNow();
		const params = new URLSearchParams(window.location.search);
		expect(params.get('foo')).toBe('bar');
		expect(params.get('baz')).toBe('1');
		expect(params.get(PARAM)).not.toBeNull();
		expect(window.location.hash).toBe('#section');
	});

	it('does not write when there is no active identity', async () => {
		const ctrl = controller(
			() => ({children: []}),
			() => null,
		);
		await ctrl.writeNow();
		expect(ctrl.hasIncomingParam()).toBe(false);
	});

	it('clear() removes only our param', async () => {
		setLocation('?foo=bar');
		const ctrl = controller(
			() => ({children: []}),
			() => ({name: 'Default', isDefault: true}),
		);
		await ctrl.writeNow();
		expect(ctrl.hasIncomingParam()).toBe(true);
		ctrl.clear();
		expect(ctrl.hasIncomingParam()).toBe(false);
		expect(new URLSearchParams(window.location.search).get('foo')).toBe('bar');
	});

	it('readIncoming returns none when the param is absent', async () => {
		const ctrl = controller(
			() => ({children: []}),
			() => ({name: 'Default', isDefault: true}),
		);
		expect((await ctrl.readIncoming()).kind).toBe('none');
	});

	it('buildUrl does not mutate the address bar', async () => {
		const ctrl = controller(
			() => ({children: []}),
			() => ({name: 'Default', isDefault: true}),
		);
		const url = await ctrl.buildUrl();
		expect(url).toContain(`${encodeURIComponent(PARAM)}=`);
		// The address bar is untouched.
		expect(ctrl.hasIncomingParam()).toBe(false);
	});

	describe('defensive versioning', () => {
		async function putParam(env: unknown): Promise<UrlShareController> {
			const value = await encodeEnvelope(env as DriftpaneShareEnvelope);
			setLocation(`?${PARAM}=${encodeURIComponent(value)}`);
			return controller(
				() => ({children: []}),
				() => ({name: 'Default', isDefault: true}),
			);
		}

		it('ignores a wrong format tag silently', async () => {
			const ctrl = await putParam({
				f: 'other-tool',
				v: 1,
				n: 'x',
				d: true,
				s: {},
			});
			expect((await ctrl.readIncoming()).kind).toBe('ignore');
		});

		it('warns once and reports too-new for a higher version', async () => {
			const warn = vi
				.spyOn(console, 'warn')
				.mockImplementation(() => undefined);
			const ctrl = await putParam({
				f: 'driftpane-share',
				v: 99,
				n: 'x',
				d: true,
				s: {},
			});
			expect((await ctrl.readIncoming()).kind).toBe('too-new');
			expect(warn).toHaveBeenCalledTimes(1);
		});

		it('ignores a corrupt/undecodable param silently', async () => {
			setLocation(`?${PARAM}=not-a-valid-payload`);
			const ctrl = controller(
				() => ({children: []}),
				() => ({name: 'Default', isDefault: true}),
			);
			expect((await ctrl.readIncoming()).kind).toBe('ignore');
		});
	});

	describe('dedupe (monitor noise)', () => {
		function emitterPane(): {
			pane: {on: (ev: 'change', h: (e: unknown) => void) => unknown};
			emit: () => void;
		} {
			let handler: ((e: unknown) => void) | null = null;
			return {
				pane: {
					on: (_ev, h) => {
						handler = h;
						return undefined;
					},
				},
				emit: () => {
					if (handler) handler(undefined);
				},
			};
		}

		it('writes on a real change but ignores identical (monitor) changes', async () => {
			setLocation('');
			let snap: SerializedState = {children: [{binding: {key: 'x', value: 1}}]};
			const ep = emitterPane();
			const ctrl = new UrlShareController(ep.pane, {
				paramKey: PARAM,
				debounceMs: 0,
				getSnapshot: () => snap,
				getIdentity: () => ({name: 'D', isDefault: true}),
			});
			ctrl.attach();

			// identical snapshot -> dedupe -> no write (also respects lazy)
			ep.emit();
			await new Promise((r) => setTimeout(r, 20));
			expect(ctrl.hasIncomingParam()).toBe(false);

			// real change -> writes
			snap = {children: [{binding: {key: 'x', value: 2}}]};
			ep.emit();
			await new Promise((r) => setTimeout(r, 20));
			expect(ctrl.hasIncomingParam()).toBe(true);
		});
	});

	describe('codec', () => {
		it('encodeEnvelope/decodeEnvelope round-trip', async () => {
			const env: DriftpaneShareEnvelope = {
				f: 'driftpane-share',
				v: 1,
				id: 'abc',
				n: 'Name',
				d: false,
				s: {children: [{binding: {key: 'k', value: [1, 2, 3]}}]},
			};
			const value = await encodeEnvelope(env);
			expect(await decodeEnvelope(value)).toEqual(env);
		});
	});
});
