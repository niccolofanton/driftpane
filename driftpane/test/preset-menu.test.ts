import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {PresetMenu} from '../src/preset-menu.js';
import {PresetController} from '../src/presets.js';
import {DriftpaneStorage} from '../src/storage.js';
import {SerializedState} from '../src/types.js';
import {FakeFolder, FakePane} from './helpers/fake-pane.js';

function liveState(): SerializedState {
	return {
		expanded: true,
		children: [
			{title: 'Preset', expanded: true, children: []},
			{binding: {key: 'speed', value: 0.5}},
		],
	};
}

/**
 * Intercepts the <a download> created by downloadFile and stubs the URL
 * object-URL helpers (absent in jsdom). Returns the captured anchors. The spies
 * are cleared by vi.restoreAllMocks() in afterEach.
 */
function captureDownloads(): HTMLAnchorElement[] {
	const created: HTMLAnchorElement[] = [];
	const realCreate = document.createElement.bind(document);
	vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
		const el = realCreate(tag);
		if (String(tag).toLowerCase() === 'a') {
			const anchor = el as HTMLAnchorElement;
			// jsdom does not implement navigation; neutralize the click so the
			// download attempt does not log a "not implemented" warning.
			anchor.click = (): void => undefined;
			created.push(anchor);
		}
		return el;
	}) as typeof document.createElement);
	const urlObj = URL as unknown as {
		createObjectURL: unknown;
		revokeObjectURL: unknown;
	};
	urlObj.createObjectURL = (): string => 'blob:test';
	urlObj.revokeObjectURL = (): void => undefined;
	return created;
}

describe('PresetMenu', () => {
	let pane: FakePane;
	let presets: PresetController;
	let menu: PresetMenu;
	let onAfterApply: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		localStorage.clear();
		document.body.innerHTML = '';
		pane = new FakePane({initialState: liveState()});
		const storage = new DriftpaneStorage('menu-test');
		presets = new PresetController(pane, storage, {managerChildIndex: 0});
		onAfterApply = vi.fn();
		menu = new PresetMenu(pane, presets, {
			folderTitle: 'Presets',
			onAfterApply,
			onResetPosition: vi.fn(),
		});
	});
	afterEach(() => {
		menu.dispose();
		vi.restoreAllMocks();
	});

	it('mounts the preset folder at child index 0', () => {
		menu.mount();
		expect(pane.children).toHaveLength(1);
		expect(pane.children[0]).toBeInstanceOf(FakeFolder);
		expect(pane.children[0].title).toBe('Presets');
	});

	it('creates the action buttons inside the folder', () => {
		const folder = menu.mount() as unknown as FakeFolder;
		expect(folder.button('Restore')).toBeDefined();
		expect(folder.button('Save changes')).toBeDefined();
		expect(folder.button('Save as new')).toBeDefined();
		expect(folder.button('Rename preset')).toBeDefined();
		expect(folder.button('Export')).toBeDefined();
		expect(folder.button('Import')).toBeDefined();
		expect(folder.button('Reset position')).toBeDefined();
	});

	it('does NOT create "Delete preset" by default, creates it with showDeletePreset', () => {
		const folder = menu.mount() as unknown as FakeFolder;
		expect(folder.button('Delete preset')).toBeUndefined();
		menu.dispose();

		const storage = new DriftpaneStorage('menu-del');
		const presets2 = new PresetController(pane, storage, {
			managerChildIndex: 0,
		});
		const menu2 = new PresetMenu(pane, presets2, {
			folderTitle: 'P',
			onAfterApply: vi.fn(),
			showDeletePreset: true,
		});
		const folder2 = menu2.mount() as unknown as FakeFolder;
		expect(folder2.button('Delete preset')).toBeDefined();
		menu2.dispose();
	});

	it('creates an off-screen file input appended to the document body', () => {
		menu.mount();
		const input = document.querySelector(
			'input[type="file"]',
		) as HTMLInputElement | null;
		expect(input).not.toBeNull();
		expect(input?.style.position).toBe('fixed');
		expect(input?.style.left).toBe('-9999px');
		expect(input?.getAttribute('aria-hidden')).toBe('true');
		// NOT display:none (must stay renderable so .click() opens the picker).
		expect(input?.style.display).not.toBe('none');
	});

	it('"Save as new" prompts for a name and creates a custom preset', () => {
		vi.spyOn(window, 'prompt').mockReturnValue('Fresh');
		const folder = menu.mount() as unknown as FakeFolder;
		folder.button('Save as new')?.click();
		expect(presets.list()).toHaveLength(1);
		expect(presets.list()[0].name).toBe('Fresh');
		expect(presets.list()[0].custom).toBe(true);
	});

	it('"Save as new" is cancelled when prompt returns null', () => {
		vi.spyOn(window, 'prompt').mockReturnValue(null);
		const folder = menu.mount() as unknown as FakeFolder;
		folder.button('Save as new')?.click();
		expect(presets.list()).toHaveLength(0);
	});

	it('"Save changes" overwrites the active preset (with confirmation)', () => {
		vi.spyOn(window, 'prompt').mockReturnValue('A');
		vi.spyOn(window, 'confirm').mockReturnValue(true);
		const folder = menu.mount() as unknown as FakeFolder;
		folder.button('Save as new')?.click();
		expect(presets.list()).toHaveLength(1);
		folder.button('Save changes')?.click();
		expect(presets.list()).toHaveLength(1); // overwritten, not added
	});

	it('"Save changes" does NOT overwrite when confirmation is cancelled', () => {
		vi.spyOn(window, 'prompt').mockReturnValue('A');
		const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
		const folder = menu.mount() as unknown as FakeFolder;
		folder.button('Save as new')?.click();
		const before = JSON.stringify(presets.list()[0].state);
		folder.button('Save changes')?.click();
		expect(confirmSpy).toHaveBeenCalled();
		expect(JSON.stringify(presets.list()[0].state)).toBe(before);
	});

	it('selecting a preset from the list applies it and calls onAfterApply', () => {
		const folder = menu.mount() as unknown as FakeFolder;
		const p = presets.save('Selectable');
		menu.refreshList();
		folder.list()?.select(p.id);
		expect(onAfterApply).toHaveBeenCalled();
	});

	it('"Save changes" is disabled on the Default and enabled on custom presets', () => {
		const folder = menu.mount() as unknown as FakeFolder;
		presets.ensureDefault('Default'); // active = Default (custom:false)
		menu.refreshList();
		expect(folder.button('Save changes')?.disabled).toBe(true);
		expect(folder.button('Restore')?.disabled).toBe(false);

		// Select a custom preset from the list -> Save changes becomes enabled.
		const c = presets.save('Mine');
		menu.refreshList();
		folder.list()?.select(c.id);
		expect(folder.button('Save changes')?.disabled).toBe(false);
	});

	it('shows a toast (console.info + DOM node) on rename feedback', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});
		vi.spyOn(window, 'prompt')
			.mockReturnValueOnce('Original') // for Save as new
			.mockReturnValueOnce('Renamed'); // for Rename
		const folder = menu.mount() as unknown as FakeFolder;
		folder.button('Save as new')?.click();
		folder.button('Rename preset')?.click();
		expect(info).toHaveBeenCalled();
		const toast = document.querySelector('[data-driftpane-toast]');
		expect(toast).not.toBeNull();
		expect(toast?.textContent).toContain('Renamed');
	});

	it('"Rename preset" notifies when nothing is selected', () => {
		const info = vi.spyOn(console, 'info').mockImplementation(() => {});
		const folder = menu.mount() as unknown as FakeFolder;
		folder.button('Rename preset')?.click();
		expect(info).toHaveBeenCalledWith(
			expect.stringContaining('No preset selected'),
		);
	});

	it('refreshList updates the selector value to the active id', () => {
		const folder = menu.mount() as unknown as FakeFolder;
		const p = presets.save('Active');
		menu.refreshList();
		expect(folder.list()?.value).toBe(p.id);
	});

	it('dispose removes the file input and the folder', () => {
		const folder = menu.mount() as unknown as FakeFolder;
		expect(document.querySelector('input[type="file"]')).not.toBeNull();
		menu.dispose();
		expect(document.querySelector('input[type="file"]')).toBeNull();
		expect(folder.disposed).toBe(true);
	});

	it('"Export" downloads the SELECTED preset, named after it', () => {
		const folder = menu.mount() as unknown as FakeFolder;
		const p = presets.save('My Cool Preset');
		menu.refreshList();
		folder.list()?.select(p.id);
		const anchors = captureDownloads();
		folder.button('Export')?.click();
		expect(anchors).toHaveLength(1);
		expect(anchors[0].download).toBe('My Cool Preset.json');
	});

	it('"Export" sanitizes illegal filename chars from the preset name', () => {
		const folder = menu.mount() as unknown as FakeFolder;
		const p = presets.save('a/b:c*d');
		menu.refreshList();
		folder.list()?.select(p.id);
		const anchors = captureDownloads();
		folder.button('Export')?.click();
		expect(anchors[0].download).toBe('a-b-c-d.json');
	});

	it('"Export all" appears only with onExportAll and triggers the download', () => {
		// Default menu: no onExportAll -> no "Export all" button.
		const folder = menu.mount() as unknown as FakeFolder;
		expect(folder.button('Export all')).toBeUndefined();
		menu.dispose();

		const onExportAll = vi.fn(() => ({
			filename: 'driftpane-x-backup.json',
			content: '{"format":"driftpane-backup"}',
		}));
		const storage = new DriftpaneStorage('menu-exportall');
		const presets2 = new PresetController(pane, storage, {
			managerChildIndex: 0,
		});
		const menu2 = new PresetMenu(pane, presets2, {
			folderTitle: 'P',
			onAfterApply: vi.fn(),
			onExportAll,
		});
		const folder2 = menu2.mount() as unknown as FakeFolder;
		const anchors = captureDownloads();
		folder2.button('Export all')?.click();
		expect(onExportAll).toHaveBeenCalled();
		expect(anchors[0].download).toBe('driftpane-x-backup.json');
		menu2.dispose();
	});
});
