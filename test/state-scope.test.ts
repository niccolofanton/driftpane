import {describe, expect, it} from 'vitest';

import {
	childrenCount,
	mergeManagerChild,
	stripManagerChild,
	structureSignature,
} from '../src/state-scope.js';
import {SerializedState} from '../src/types.js';

describe('childrenCount', () => {
	it('returns the length of a valid children array', () => {
		expect(childrenCount({children: [1, 2, 3]})).toBe(3);
	});
	it('returns 0 when children is missing', () => {
		expect(childrenCount({})).toBe(0);
	});
	it('returns 0 when children is not an array', () => {
		expect(childrenCount({children: 'nope'})).toBe(0);
		expect(childrenCount({children: null})).toBe(0);
	});
});

describe('structureSignature', () => {
	const a: SerializedState = {
		children: [
			{title: 'Folder', expanded: true, children: [{binding: {key: 'x'}}]},
		],
	};

	it('is equal for states that differ only in values / expanded', () => {
		const b: SerializedState = {
			children: [
				{
					title: 'Folder',
					expanded: false, // different
					children: [{binding: {key: 'x', value: 99}}], // different value
				},
			],
		};
		expect(structureSignature(a)).toBe(structureSignature(b));
	});

	it('differs when a folder title changes', () => {
		const b: SerializedState = {
			children: [{title: 'Renamed', children: [{binding: {key: 'x'}}]}],
		};
		expect(structureSignature(a)).not.toBe(structureSignature(b));
	});

	it('differs when a binding key changes', () => {
		const b: SerializedState = {
			children: [{title: 'Folder', children: [{binding: {key: 'y'}}]}],
		};
		expect(structureSignature(a)).not.toBe(structureSignature(b));
	});

	it('differs when a child is added or removed', () => {
		const more: SerializedState = {
			children: [
				{title: 'Folder', children: [{binding: {key: 'x'}}]},
				{title: 'Extra'},
			],
		};
		expect(structureSignature(a)).not.toBe(structureSignature(more));
	});

	it('handles non-object / empty input gracefully', () => {
		expect(structureSignature({})).toBe(structureSignature({}));
		expect(typeof structureSignature(null as unknown as SerializedState)).toBe(
			'string',
		);
	});
});

describe('stripManagerChild', () => {
	const full: SerializedState = {
		expanded: true,
		children: [{title: 'Manager'}, {title: 'A'}, {title: 'B'}],
	};

	it('removes the child at the given index', () => {
		const out = stripManagerChild(full, 0);
		expect((out['children'] as unknown[]).length).toBe(2);
		expect((out['children'] as Array<{title: string}>)[0].title).toBe('A');
	});

	it('does not mutate the original', () => {
		stripManagerChild(full, 0);
		expect((full['children'] as unknown[]).length).toBe(3);
	});

	it('preserves top-level fields', () => {
		const out = stripManagerChild(full, 0);
		expect(out['expanded']).toBe(true);
	});

	it('returns an unchanged copy when children is missing', () => {
		const out = stripManagerChild({foo: 1}, 0);
		expect(out).toEqual({foo: 1});
	});

	it('returns an unchanged copy when index is out of range', () => {
		expect(stripManagerChild(full, -1)['children']).toHaveLength(3);
		expect(stripManagerChild(full, 5)['children']).toHaveLength(3);
	});
});

describe('mergeManagerChild', () => {
	const live: SerializedState = {
		expanded: false,
		children: [{title: 'Manager', live: true}, {title: 'A'}, {title: 'B'}],
	};

	it('re-inserts the live manager child at the index (round-trip)', () => {
		const scoped = stripManagerChild(live, 0);
		const merged = mergeManagerChild(live, scoped, 0);
		expect(
			(merged['children'] as Array<{title: string}>).map((c) => c.title),
		).toEqual(['Manager', 'A', 'B']);
		// The re-inserted manager child is the LIVE one.
		expect((merged['children'] as Array<{live?: boolean}>)[0].live).toBe(true);
	});

	it('keeps top-level fields from the scoped state', () => {
		const scoped: SerializedState = {expanded: true, children: [{title: 'A'}]};
		const merged = mergeManagerChild(live, scoped, 0);
		expect(merged['expanded']).toBe(true);
	});

	it('returns scoped as-is when target has no children array', () => {
		const scoped: SerializedState = {children: [{title: 'A'}]};
		const merged = mergeManagerChild({foo: 1}, scoped, 0);
		expect(merged).toEqual(scoped);
	});

	it('handles a scoped state with no children array', () => {
		const merged = mergeManagerChild(live, {expanded: true}, 0);
		expect((merged['children'] as unknown[])[0]).toEqual({
			title: 'Manager',
			live: true,
		});
	});

	it('skips re-insertion when the manager index is out of range in target', () => {
		const scoped: SerializedState = {children: [{title: 'A'}]};
		const merged = mergeManagerChild(live, scoped, 99);
		expect((merged['children'] as unknown[]).length).toBe(1);
	});

	it('signature of strip+merge round-trip matches the live structure', () => {
		const scoped = stripManagerChild(live, 0);
		const merged = mergeManagerChild(live, scoped, 0);
		expect(structureSignature(merged)).toBe(structureSignature(live));
	});
});
