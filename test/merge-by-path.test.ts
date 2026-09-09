import {describe, expect, it} from 'vitest';

import {
	buildSharedImport,
	mergeByPath,
	stripReadonly,
} from '../src/state-scope.js';
import {SerializedState} from '../src/types.js';

describe('stripReadonly', () => {
	it('normalizes readonly binding values but keeps editable ones', () => {
		const state: SerializedState = {
			children: [
				{binding: {key: 'speed', value: 0.5}},
				{binding: {key: 'fps', value: 120, readonly: true}},
				{
					title: 'Mon',
					children: [{binding: {key: 'sine', value: 0.9, readonly: true}}],
				},
			],
		};
		const a = stripReadonly(state) as {children: any[]};
		const b = stripReadonly({
			...state,
			children: [
				{binding: {key: 'speed', value: 0.5}},
				{binding: {key: 'fps', value: 999, readonly: true}},
				{
					title: 'Mon',
					children: [{binding: {key: 'sine', value: -0.1, readonly: true}}],
				},
			],
		} as SerializedState);
		// readonly values differ in input but become identical after stripping
		expect(JSON.stringify(a)).toBe(JSON.stringify(b));
		expect(a.children[0].binding.value).toBe(0.5); // editable kept
		expect(a.children[1].binding.value).toBeNull(); // readonly normalized
	});
});

describe('mergeByPath', () => {
	it('overwrites matching binding values, keeps the live structure', () => {
		const target: SerializedState = {
			children: [
				{
					title: 'A',
					children: [
						{binding: {key: 'x', value: 1}},
						{binding: {key: 'y', value: 2}},
					],
				},
			],
		};
		const source: SerializedState = {
			children: [
				{
					title: 'A',
					children: [
						{binding: {key: 'x', value: 9}},
						{binding: {key: 'y', value: 8}},
					],
				},
			],
		};
		const merged = mergeByPath(target, source) as {children: unknown[]};
		const folder = merged.children[0] as {children: unknown[]};
		expect(
			(folder.children[0] as {binding: {value: unknown}}).binding.value,
		).toBe(9);
		expect(
			(folder.children[1] as {binding: {value: unknown}}).binding.value,
		).toBe(8);
	});

	it('disambiguates the same key in different folders by path', () => {
		const target: SerializedState = {
			children: [
				{title: 'A', children: [{binding: {key: 'v', value: 1}}]},
				{title: 'B', children: [{binding: {key: 'v', value: 2}}]},
			],
		};
		const source: SerializedState = {
			children: [
				{title: 'A', children: [{binding: {key: 'v', value: 10}}]},
				{title: 'B', children: [{binding: {key: 'v', value: 20}}]},
			],
		};
		const merged = mergeByPath(target, source) as {children: unknown[]};
		const a = merged.children[0] as {children: unknown[]};
		const b = merged.children[1] as {children: unknown[]};
		expect((a.children[0] as {binding: {value: unknown}}).binding.value).toBe(
			10,
		);
		expect((b.children[0] as {binding: {value: unknown}}).binding.value).toBe(
			20,
		);
	});

	it('falls back to a globally-unique leaf key when the folder was renamed', () => {
		const target: SerializedState = {
			children: [{title: 'A', children: [{binding: {key: 'z', value: 1}}]}],
		};
		const source: SerializedState = {
			children: [
				{title: 'RENAMED', children: [{binding: {key: 'z', value: 99}}]},
			],
		};
		const merged = mergeByPath(target, source) as {children: unknown[]};
		const folder = merged.children[0] as {children: unknown[]};
		expect(
			(folder.children[0] as {binding: {value: unknown}}).binding.value,
		).toBe(99);
	});

	it('keeps the value when no match exists (extra binding only in target)', () => {
		const target: SerializedState = {
			children: [
				{binding: {key: 'a', value: 1}},
				{binding: {key: 'b', value: 2}},
			],
		};
		const source: SerializedState = {
			children: [{binding: {key: 'a', value: 7}}],
		};
		const merged = mergeByPath(target, source) as {children: unknown[]};
		expect(
			(merged.children[0] as {binding: {value: unknown}}).binding.value,
		).toBe(7);
		expect(
			(merged.children[1] as {binding: {value: unknown}}).binding.value,
		).toBe(2);
	});
});

describe('buildSharedImport', () => {
	const liveFull: SerializedState = {
		expanded: true,
		children: [
			{binding: {key: 'speed', value: 0.5}},
			{binding: {key: 'gamma', value: 1}},
			{title: 'Preset', expanded: true, children: []},
		],
	};
	const managerIndex = 2;

	it('uses shared values directly when the structure matches', () => {
		const source: SerializedState = {
			children: [
				{binding: {key: 'speed', value: 0.9}},
				{binding: {key: 'gamma', value: 4}},
			],
		};
		const full = buildSharedImport(liveFull, source, managerIndex) as {
			children: unknown[];
		};
		expect(
			(full.children[0] as {binding: {value: unknown}}).binding.value,
		).toBe(0.9);
		expect(
			(full.children[1] as {binding: {value: unknown}}).binding.value,
		).toBe(4);
		// preset folder re-inserted at the end
		expect((full.children[2] as {title?: string}).title).toBe('Preset');
	});

	it('merges by path when the structure differs, keeping unmatched values', () => {
		// source lacks `gamma` -> structures differ -> merge-by-path
		const source: SerializedState = {
			children: [{binding: {key: 'speed', value: 0.9}}],
		};
		const full = buildSharedImport(liveFull, source, managerIndex) as {
			children: unknown[];
		};
		expect(
			(full.children[0] as {binding: {value: unknown}}).binding.value,
		).toBe(0.9);
		// gamma had no match -> keeps the live value
		expect(
			(full.children[1] as {binding: {value: unknown}}).binding.value,
		).toBe(1);
		expect((full.children[2] as {title?: string}).title).toBe('Preset');
	});
});
