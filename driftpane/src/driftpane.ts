// Public facade of the Driftpane layer.
//
// Orchestrator that, given an already-built `Pane`, enables the features:
//  1) state persistence (pane values + expanded)                  [persistence]
//  2) persistent draggable panel                                  [draggable]
//  3) open/closed persistence of pane and folders                 [persistence]
//  4) preset menu (save/apply/list/export/import)                 [presets + menu]
//  5) light/dark/auto theme (skin), persisted                     [theme]
//  6) maximum height (vh) with scrollable content                 [scroll]
//
// Initialization order (important):
//  a) inject CSS;
//  b) build the ThemeController -> sets data-theme on pane.element (so the
//     preset menu "Theme" selector can use it already at mount);
//  c) mount the PresetMenu -> the preset folder is APPENDED AT THE BOTTOM, so it
//     is the last child of the pane. State/preset scoping therefore uses a
//     managerChildIndex computed as "last index" (lazy resolver: reads
//     exportState at use time, always after the mount);
//  d) build PersistenceController and RESTORE the saved state (the pane already
//     has the preset folder as its last child, so positional merge is valid);
//  e) enable the DraggableController (wraps pane.element in the fixed container);
//  f) apply the height cap to the root panel (default calc(100dvh - 48px)).

import {DraggableController} from './draggable.js';
import {PersistenceController} from './persistence.js';
import {PresetMenu} from './preset-menu.js';
import {PresetController} from './presets.js';
import {applyMaxHeight, clearMaxHeight} from './scroll.js';
import {childrenCount} from './state-scope.js';
import {DriftpaneStorage} from './storage.js';
import {injectStyles} from './styles.js';
import {DriftpaneTheme, ThemeController} from './theme-controller.js';
import {DriftpaneOptions, DriftpanePosition} from './types.js';

/**
 * Structural type of the Pane required by the facade. Uses only public members
 * of Tweakpane, so the layer does not depend on internal core imports.
 */
export interface PaneLike {
	exportState(): Record<string, unknown>;
	importState(state: Record<string, unknown>): boolean;
	on(ev: 'change' | 'fold', handler: (e: unknown) => void): unknown;
	addBlade(params: Record<string, unknown>): unknown;
	refresh(): void;
	element: HTMLElement;
}

/**
 * DEFAULT height cap of the panel: the full viewport height minus a 24px safe
 * zone above and below (24 + 24 = 48). `dvh` follows the dynamic viewport
 * (mobile browser bars). Overridable with `maxHeightVh` or, at runtime, with
 * `driftpane.setMaxHeight(...)`.
 */
const DEFAULT_MAX_HEIGHT = 'calc(100dvh - 48px)';

/** Default values of the options. */
const DEFAULTS = {
	storageNamespace: 'default',
	debounceMs: 300,
	draggable: true,
	presetsEnabled: true,
	presetFolderTitle: 'Preset',
	defaultPresetName: 'Default',
	// "Service" controls in the preset menu: hidden by default.
	showThemeControl: false,
	showResetPosition: false,
	showDeletePreset: false,
	showExportAll: false,
	clampToViewport: true,
	// 24px safe zone from every edge (consistent with the default height cap).
	defaultPosition: {x: 24, y: 24} as DriftpanePosition,
	theme: 'auto' as DriftpaneTheme,
	// "Sensible" default sizes; per-axis resize enabled (overridable).
	width: 280,
	resizableWidth: true,
	resizableHeight: true,
};

/** localStorage key suffix for the user-set max-height. */
const MAXHEIGHT_KEY = 'maxHeight';

export class Driftpane {
	/** The managed Pane. */
	public readonly pane: PaneLike;
	/** Preset controller (programmatic API). */
	public readonly presets: PresetController;
	/** Drag controller (can be used to reset the position). */
	public readonly draggable: DraggableController;
	/** Theme controller (programmatic API: theme.set('dark'), etc.). */
	public readonly theme: ThemeController;

	private readonly storage: DriftpaneStorage;
	private readonly persistence: PersistenceController;
	private readonly presetMenu: PresetMenu | null;
	private readonly presetsEnabled: boolean;
	private readonly draggableEnabled: boolean;
	/** Host of the height cap (the root panel, = pane.element). */
	private readonly maxHeightHost: HTMLElement;

	constructor(pane: PaneLike, opts?: DriftpaneOptions) {
		const options = {...DEFAULTS, ...(opts ?? {})};
		this.pane = pane;
		this.presetsEnabled = options.presetsEnabled;
		this.draggableEnabled = options.draggable;

		this.storage = new DriftpaneStorage(options.storageNamespace);

		// (a) Layer CSS.
		injectStyles(pane.element.ownerDocument);

		// (b) Theme: sets data-theme on pane.element (light/dark/auto). It must be
		// created BEFORE the preset menu, which shows its "Theme" selector.
		this.theme = new ThemeController({
			target: pane.element,
			storage: this.storage,
			initial: options.theme,
		});

		// The preset folder is the LAST child of the pane (see preset-menu). The
		// scoping must therefore exclude the last index. We use a lazy resolver
		// (`() => last index`) instead of a constant: it is called only by the
		// controller methods (apply/save/restore), always AFTER the mount, when
		// exportState already includes the preset folder at the end. If presets are
		// disabled there is no manager folder: index -1 (nothing is excluded).
		const managerChildIndex: number | (() => number) = this.presetsEnabled
			? (): number => childrenCount(this.pane.exportState()) - 1
			: -1;

		// The PresetController is also needed by the menu: we always create it (it
		// is lightweight), but we mount the UI only if presetsEnabled.
		this.presets = new PresetController(pane, this.storage, {
			managerChildIndex,
		});

		// (c) Mount the preset menu: the preset folder is appended at the bottom.
		// The "Theme" selector is added at the top of the folder by passing the
		// themeController.
		if (this.presetsEnabled) {
			this.presetMenu = new PresetMenu(pane, this.presets, {
				folderTitle: options.presetFolderTitle,
				onAfterApply: () => this.pane.refresh(),
				// Theme and "Reset position" are optional and HIDDEN by default:
				// we pass them only if explicitly requested (the menu shows them
				// when present). The theme is still applied by the option.
				onResetPosition: options.showResetPosition
					? () => this.draggable.resetPosition()
					: undefined,
				themeController: options.showThemeControl ? this.theme : undefined,
				showDeletePreset: options.showDeletePreset,
				onExportAll: options.showExportAll
					? () => ({
							filename: `driftpane-${options.storageNamespace}-backup.json`,
							content: this.exportAllJSON(),
						})
					: undefined,
			});
			this.presetMenu.mount();
			// Ensures a "Default" preset (non-deletable baseline) by capturing the
			// FACTORY state: it must be done AFTER the mount (so the scoping excludes
			// the preset folder) and BEFORE the restore (so it captures the defaults,
			// not the saved state). It is the target of "Restore".
			this.presets.ensureDefault(options.defaultPresetName);
		} else {
			this.presetMenu = null;
		}

		// (d) Persistence: registers change/fold and restores the saved state.
		this.persistence = new PersistenceController(pane, this.storage, {
			debounceMs: options.debounceMs,
			managerChildIndex,
		});
		const restored = this.persistence.restore();
		if (restored) {
			// Align the UI to the imported values.
			this.pane.refresh();
		}
		// Always: show the Default preset in the selector and update the button
		// states (even when there was nothing to restore).
		this.presetMenu?.refreshList();

		// (e) Drag: we always build the controller (for resetPosition), but we
		// enable it only if requested.
		this.draggable = new DraggableController(pane, this.storage, {
			clampToViewport: options.clampToViewport,
			defaultPosition: options.defaultPosition,
			width: options.width,
			resizableWidth: options.resizableWidth,
			resizableHeight: options.resizableHeight,
		});
		if (this.draggableEnabled) {
			this.draggable.enable();
		}

		// (f) Height cap: ALWAYS active, so the panel never exceeds the viewport
		// and scrolls beyond the cap. Priority: user-persisted max-height (resize) >
		// maxHeightVh option > DEFAULT_MAX_HEIGHT default. The host is the root
		// panel (pane.element = .tp-rotv).
		this.maxHeightHost = pane.element;
		const persistedMaxHeight = this.storage.readJSON<string | null>(
			MAXHEIGHT_KEY,
			null,
		);
		const initialMaxHeight =
			typeof persistedMaxHeight === 'string' && persistedMaxHeight.trim() !== ''
				? persistedMaxHeight
				: typeof options.maxHeightVh === 'number'
					? `${options.maxHeightVh}vh`
					: DEFAULT_MAX_HEIGHT;
		applyMaxHeight(this.maxHeightHost, initialMaxHeight);
	}

	/**
	 * Sets the maximum height of the panel at runtime, and persists it. Beyond
	 * the cap the panel becomes scrollable.
	 * @param value Number = height in `vh`; string = any CSS length
	 *   (e.g. '400px', 'calc(100dvh - 48px)'); `null` = restore the default
	 *   (`calc(100dvh - 48px)`, 24px safe zone top/bottom) and forget the override.
	 */
	public setMaxHeight(value: number | string | null): void {
		if (value === null) {
			applyMaxHeight(this.maxHeightHost, DEFAULT_MAX_HEIGHT);
			this.storage.remove(MAXHEIGHT_KEY);
			return;
		}
		const css = typeof value === 'number' ? `${value}vh` : value;
		applyMaxHeight(this.maxHeightHost, css);
		this.storage.writeJSON(MAXHEIGHT_KEY, css);
	}

	/**
	 * Serializes a FULL backup of the namespace's persisted state into a versioned
	 * JSON envelope: panel values/folds (`state`), drag `position`, `width`,
	 * `maxHeight`, `theme` and the whole `presets` store. Missing keys are omitted.
	 */
	public exportAllJSON(): string {
		const suffixes = [
			'state',
			'position',
			'width',
			'maxHeight',
			'theme',
			'presets',
		];
		const data: Record<string, unknown> = {};
		for (const suffix of suffixes) {
			const value = this.storage.readJSON<unknown>(suffix, null);
			if (value !== null) {
				data[suffix] = value;
			}
		}
		const envelope = {
			format: 'driftpane-backup',
			version: 1 as const,
			namespace: this.storage.getNamespace(),
			exportedAt: new Date().toISOString(),
			data,
		};
		return JSON.stringify(envelope, null, 2);
	}

	/** Saves the current state as a new preset with the given name. */
	public savePresetAs(name: string): void {
		this.presets.save(name);
		this.presetMenu?.refreshList();
	}

	/** Applies a preset by id and updates the UI. */
	public applyPreset(id: string): void {
		if (this.presets.apply(id)) {
			this.pane.refresh();
			this.presetMenu?.refreshList();
		}
	}

	/**
	 * Resets the persisted pane state (does NOT touch the presets nor the
	 * position). Removes the state key; on reload, the pane returns to the
	 * initial defaults.
	 */
	public resetState(): void {
		this.persistence.clear();
	}

	/** Tears down the manager: removes listeners and added UI. */
	public dispose(): void {
		this.persistence.dispose();
		this.draggable.dispose();
		this.presetMenu?.dispose();
		this.theme.dispose();
		clearMaxHeight(this.maxHeightHost);
	}
}

/** Functional helper: instantiates a Driftpane on an existing Pane. */
export function createDriftpane(
	pane: PaneLike,
	opts?: DriftpaneOptions,
): Driftpane {
	return new Driftpane(pane, opts);
}
