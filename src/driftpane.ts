// Public facade of the Driftpane layer.
//
// Orchestrator that, given an already-built `Pane`, enables the features:
//  1) state persistence (pane values + expanded)                  [persistence]
//  2) persistent draggable panel                                  [draggable]
//  3) open/closed persistence of pane and folders                 [persistence]
//  4) preset menu (save/apply/list/export/import)                 [presets + menu]
//  5) light/dark/auto theme (skin), persisted                     [theme]
//  6) maximum height (vh) with scrollable content                 [scroll]
//  7) shareable configuration links                              [url-share]
//
// Initialization order (important):
//  a) inject CSS;
//  b) build the ThemeController -> sets data-theme on pane.element (so the
//     preset menu "Theme" selector can use it already at mount);
//  c) mount the PresetMenu; resolve its position by API identity, including
//     after controls are added or reordered;
//  d) build PersistenceController and restore the scoped state;
//  e) build DraggableController, apply the height cap, then enable dragging so
//     the initial clamp measures the capped panel;
//  f) attach URL sync and resolve any incoming shared configuration.
import {DraggableController} from './draggable.js';
import {PersistenceController} from './persistence.js';
import {PresetMenu} from './preset-menu.js';
import {PresetController} from './presets.js';
import {applyMaxHeight, clearMaxHeight, isMaxHeightValue} from './scroll.js';
import {SidepanelController} from './sidepanel.js';
import {
	buildSharedImport,
	importPaneState,
	mergeManagerChild,
	stripManagerChild,
	stripReadonly,
	structureSignature,
} from './state-scope.js';
import {DriftpaneStorage} from './storage.js';
import {injectStyles} from './styles.js';
import {DriftpaneTheme, ThemeController} from './theme-controller.js';
import type {DriftpaneSidepanelOptions} from './types.js';
import {
	DriftpaneApplyReason,
	DriftpaneOptions,
	DriftpanePosition,
	SerializedState,
} from './types.js';
import {UrlShareController} from './url-share.js';

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
	// URL config sharing: on by default (forces the preset menu on).
	urlSync: true,
	urlParamKey: 'dp',
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
	public sidepanel: SidepanelController | null = null;

	private readonly storage: DriftpaneStorage;
	private readonly persistence: PersistenceController;
	private readonly presetMenu: PresetMenu | null;
	private readonly presetsEnabled: boolean;
	private readonly draggableEnabled: boolean;
	/** URL sharing controller, or null when `urlSync` is disabled. */
	private readonly urlShare: UrlShareController | null;
	/** Resolver for the actual preset folder index, shared by all features. */
	private readonly managerChildIndex: number | (() => number);
	/** Host of the height cap (the root panel, = pane.element). */
	private readonly maxHeightHost: HTMLElement;
	/** Consumer hook fired after every state application (see DriftpaneOptions). */
	private readonly onStateApplied?: (reason: DriftpaneApplyReason) => void;
	private disposed = false;
	private sharePreviewActive = false;
	private sharePreviewOriginalState: SerializedState | null = null;
	private unsubscribePresets?: () => void;
	private readonly preventHostFormSubmit = (event: MouseEvent): void => {
		const target = event.target;
		if (!(target instanceof Element)) return;
		const button = target.closest('button');
		if (
			button &&
			this.pane.element.contains(button) &&
			!button.hasAttribute('type')
		) {
			// Tweakpane buttons have an implicit submit type when embedded in a form.
			event.preventDefault();
		}
	};

	constructor(pane: PaneLike, opts?: DriftpaneOptions) {
		const options = {...DEFAULTS, ...(opts ?? {})};
		this.pane = pane;
		// URL sharing forces the preset menu on (the share UI lives in the preset
		// folder, and the shared unit is a preset). To get a pane with no preset
		// folder, the consumer must disable BOTH presetsEnabled and urlSync.
		const urlSyncEnabled = options.urlSync;
		this.presetsEnabled = options.presetsEnabled || urlSyncEnabled;
		this.draggableEnabled = options.draggable;

		this.onStateApplied = options.onStateApplied;

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

		// Resolve the actual manager by API identity, including after user controls
		// are added, removed or reordered at runtime.
		this.managerChildIndex = this.presetsEnabled
			? (): number => this.presetMenu?.getManagerIndex() ?? -1
			: -1;

		// The PresetController is also needed by the menu: we always create it (it
		// is lightweight), but we mount the UI only if presetsEnabled.
		try {
			this.presets = new PresetController(pane, this.storage, {
				managerChildIndex: this.managerChildIndex,
			});
		} catch (error) {
			this.theme.dispose();
			throw error;
		}

		// (c) Mount the preset menu: the preset folder is appended at the bottom.
		// The "Theme" selector is added at the top of the folder by passing the
		// themeController.
		if (this.presetsEnabled) {
			this.presetMenu = new PresetMenu(pane, this.presets, {
				folderTitle: options.presetFolderTitle,
				// Every apply that originates in the menu (select, revert, delete
				// the active one, import) funnels through here, so this is where
				// the consumer hook has to fire — `applyPreset()` below is only
				// the programmatic entry point.
				onAfterApply: () => {
					this.pane.refresh();
					this.notifyStateApplied('preset');
				},
				// Theme and "Reset position" are optional and HIDDEN by default:
				// we pass them only if explicitly requested (the menu shows them
				// when present). The theme is still applied by the option.
				onResetPosition: options.showResetPosition
					? () => this.draggable.resetPosition()
					: undefined,
				themeController: options.showThemeControl ? this.theme : undefined,
				showDeletePreset: options.showDeletePreset,
				onImportBackup: (raw) => this.importAllJSON(raw),
				onExportAll: options.showExportAll
					? () => ({
							filename: `driftpane-${options.storageNamespace}-backup.json`,
							content: this.exportAllJSON(),
						})
					: undefined,
				// "Copy link" appears only when URL sharing is enabled.
				onCopyLink: urlSyncEnabled
					? () => void this.copyShareLink()
					: undefined,
			});
			this.presetMenu.mount();
			// Ensures a "Default" preset (non-deletable baseline) by capturing the
			// FACTORY state: it must be done AFTER the mount (so the scoping excludes
			// the preset folder) and BEFORE the restore (so it captures the defaults,
			// not the saved state). "Restore" reapplies whichever preset is active.
			this.presets.ensureDefault(options.defaultPresetName);
		} else {
			this.presetMenu = null;
		}

		// (d) Persistence: registers change/fold and restores the saved state.
		this.persistence = new PersistenceController(pane, this.storage, {
			debounceMs: options.debounceMs,
			managerChildIndex: this.managerChildIndex,
		});
		const restored = this.persistence.restore();
		if (restored) {
			// Align the UI to the imported values. The binding `change` handlers
			// have already fired: Tweakpane's importState writes through the
			// binding and re-emits for every value that actually differs.
			this.pane.refresh();
			this.notifyStateApplied('restore');
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

		// (f) Height cap: ALWAYS active, so the panel never exceeds the viewport
		// and scrolls beyond the cap. Priority: user-persisted max-height (resize) >
		// maxHeightVh option > DEFAULT_MAX_HEIGHT default. The host is the root
		// panel (pane.element = .tp-rotv).
		this.maxHeightHost = pane.element;
		const persistedMaxHeight = this.storage.readJSON<string | null>(
			MAXHEIGHT_KEY,
			null,
		);
		const initialMaxHeight = isMaxHeightValue(persistedMaxHeight)
			? persistedMaxHeight
			: typeof options.maxHeightVh === 'number' &&
				  Number.isFinite(options.maxHeightVh) &&
				  options.maxHeightVh > 0
				? `${options.maxHeightVh}vh`
				: DEFAULT_MAX_HEIGHT;
		applyMaxHeight(this.maxHeightHost, initialMaxHeight);
		// Measure only after the cap is applied; natural content height can be
		// much taller than the viewport and would incorrectly reset the position.
		if (this.draggableEnabled && !options.sidepanel) {
			this.draggable.enable();
		}

		if (options.sidepanel) this.setSidepanel(options.sidepanel);

		// (g) URL sharing: live-sync the active config into a namespaced query param
		// and reconcile an incoming shared link (preview + prompt). Built LAST so the
		// restore/refresh above never arms lazy sync (the listener is attached now,
		// after those synchronous changes have already fired).
		if (urlSyncEnabled) {
			this.urlShare = new UrlShareController(pane, {
				paramKey: `${options.urlParamKey}:${options.storageNamespace}`,
				debounceMs: options.debounceMs,
				// Normalize readonly monitors so their per-frame updates neither churn
				// the URL nor block the realtime debounce (see stripReadonly).
				getSnapshot: () => stripReadonly(this.presets.currentSnapshot()),
				getIdentity: () => this.presets.activeIdentity(),
			});
			this.urlShare.attach();
			this.unsubscribePresets = this.presets.subscribe(() =>
				this.urlShare?.syncIdentity(),
			);
			if (this.urlShare.hasIncomingParam()) {
				// Keep sync suspended until the incoming prompt is resolved.
				this.urlShare.suspend();
				void this.handleIncomingShare();
			}
		} else {
			this.urlShare = null;
		}
		this.pane.element.addEventListener(
			'click',
			this.preventHostFormSubmit,
			true,
		);
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
		if (!isMaxHeightValue(css)) throw new Error('Invalid maximum height');
		applyMaxHeight(this.maxHeightHost, css);
		this.storage.writeJSON(MAXHEIGHT_KEY, css);
	}

	/**
	 * Serializes a FULL backup of the namespace's persisted state into a versioned
	 * JSON envelope: panel values/folds (`state`), drag `position`, `width`,
	 * `maxHeight`, `theme` and the whole `presets` store. Unstored settings fall
	 * back to the current controllers, so a fresh panel can also be backed up.
	 */
	public exportAllJSON(): string {
		this.persistence.saveNow();
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
		if (this.sharePreviewOriginalState) {
			// A suspended preview must never become a backup, even if an older
			// persisted state exists or local edits were still awaiting debounce.
			data['state'] = stripManagerChild(
				this.sharePreviewOriginalState,
				this.resolveManagerIndex(),
			);
		}
		data['state'] ??= stripManagerChild(
			this.pane.exportState(),
			this.resolveManagerIndex(),
		);
		data['position'] ??= this.draggable.getPosition();
		data['width'] ??= this.draggable.getWidth();
		data['theme'] ??= this.theme.get();
		data['maxHeight'] ??=
			this.maxHeightHost.style.getPropertyValue('--dp-max-height');
		const collection = JSON.parse(this.presets.exportJSON());
		data['presets'] ??= {
			version: 1,
			activeId: collection.active,
			presets: collection.presets,
		};
		const envelope = {
			format: 'driftpane-backup',
			version: 1 as const,
			namespace: this.storage.getNamespace(),
			exportedAt: new Date().toISOString(),
			data,
		};
		return JSON.stringify(envelope, null, 2);
	}

	/** Restores a namespace backup into this panel, preserving its factory Default. */
	public importAllJSON(raw: string): void {
		if (this.sharePreviewActive) {
			throw new Error(
				'Accept or discard the shared preview before importing a backup',
			);
		}
		const object = (value: unknown): value is Record<string, unknown> =>
			value !== null && typeof value === 'object' && !Array.isArray(value);
		const backup: unknown = JSON.parse(raw);
		if (
			!object(backup) ||
			backup['format'] !== 'driftpane-backup' ||
			backup['version'] !== 1 ||
			!object(backup['data'])
		) {
			throw new Error('Invalid Driftpane backup');
		}
		const data = backup['data'];
		const position = data['position'];
		const width = data['width'];
		const theme = data['theme'];
		const height = data['maxHeight'];
		if (
			(position !== undefined &&
				(!object(position) ||
					typeof position['x'] !== 'number' ||
					!Number.isFinite(position['x']) ||
					typeof position['y'] !== 'number' ||
					!Number.isFinite(position['y']))) ||
			(width !== undefined &&
				(typeof width !== 'number' || !Number.isFinite(width) || width <= 0)) ||
			(theme !== undefined &&
				theme !== 'auto' &&
				theme !== 'light' &&
				theme !== 'dark') ||
			(height !== undefined && !isMaxHeightValue(height))
		) {
			throw new Error('Invalid backup settings');
		}
		const before = this.pane.exportState();
		const index = this.resolveManagerIndex();
		const state = data['state'];
		if (
			state !== undefined &&
			(!object(state) ||
				structureSignature(state) !==
					structureSignature(stripManagerChild(before, index)))
		) {
			throw new Error('Backup does not match this pane');
		}
		this.persistence.pause();
		this.urlShare?.suspend();
		try {
			if (
				state &&
				!importPaneState(
					this.pane,
					mergeManagerChild(before, state as SerializedState, index),
				)
			) {
				throw new Error('Cannot apply backup state');
			}
			// replaceStore validates the entire collection before replacing anything.
			if (data['presets'] !== undefined) {
				this.presets.replaceStore(data['presets']);
			}
		} catch (error) {
			importPaneState(this.pane, before);
			throw error;
		} finally {
			this.persistence.resume();
			// pause() cancelled any user edit queued before the import. Re-arm it
			// even on rollback so rejecting a file cannot silently lose that edit.
			this.persistence.scheduleSave();
			this.urlShare?.resume();
		}
		this.urlShare?.cancelIncomingRead();
		if (typeof height === 'string') this.setMaxHeight(height);
		if (typeof width === 'number') this.draggable.setWidth(width);
		if (object(position))
			this.draggable.setPosition(position as unknown as DriftpanePosition);
		if (theme === 'auto' || theme === 'light' || theme === 'dark')
			this.theme.set(theme);
		this.pane.refresh();
		this.presetMenu?.refreshList();
		this.persistence.saveNow();
		this.urlShare?.syncIdentity();
		if (state) this.notifyStateApplied('restore');
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
			this.notifyStateApplied('preset');
		}
	}

	/**
	 * Resets the persisted pane state (does NOT touch the presets nor the
	 * position). Removes the state key; on reload, the pane returns to the
	 * initial defaults.
	 */
	public resetState(): void {
		if (this.sharePreviewActive) {
			throw new Error('Accept or discard the shared preview first');
		}
		this.persistence.clear();
	}

	// --- URL sharing --------------------------------------------------------

	/**
	 * Fires the consumer hook. Wrapped: a throwing callback must not break
	 * startup, a preset apply, or a share prompt.
	 */
	private notifyStateApplied(reason: DriftpaneApplyReason): void {
		if (!this.onStateApplied) {
			return;
		}
		try {
			this.onStateApplied(reason);
		} catch {
			// A consumer bug is not Driftpane's problem to propagate.
		}
	}

	/** Resolves the preset folder index (number or lazy resolver). */
	private resolveManagerIndex(): number {
		return typeof this.managerChildIndex === 'function'
			? this.managerChildIndex()
			: this.managerChildIndex;
	}

	/**
	 * Handles an incoming shared link: applies the shared config as a live preview
	 * (pausing persistence so the preview is never written), then prompts to
	 * import/overwrite or discard. Async because decoding is async.
	 */
	private async handleIncomingShare(): Promise<void> {
		const share = this.urlShare;
		if (!share) {
			return;
		}
		const incoming = await share.readIncoming();
		if (this.disposed) {
			return;
		}
		if (incoming.kind !== 'envelope') {
			// none / ignore / too-new: nothing to apply, just resume sync.
			share.resume();
			return;
		}
		const env = incoming.env;

		// Skip only our own current preset on reload. Equal values can belong to
		// a different preset, whose identity still needs reconciliation.
		const localStripped = JSON.stringify(
			stripReadonly(this.presets.currentSnapshot()),
		);
		const active = this.presets.activeIdentity();
		const sameIdentity = env.d
			? active?.isDefault === true && active.name === env.n
			: active?.isDefault === false &&
				typeof env.id === 'string' &&
				active.id === env.id;
		if (sameIdentity && JSON.stringify(env.s) === localStripped) {
			share.resume();
			// A previously shared URL may still carry the old name for this UUID.
			if (active && env.n !== active.name) void share.writeNow();
			return;
		}

		const resolved = this.presets.resolveSharedAction(env);

		const preApply = this.pane.exportState();
		this.sharePreviewActive = true;
		this.presets.setSharePreviewActive(true);
		this.persistence.pause();
		this.sharePreviewOriginalState = preApply;
		const managerIndex = this.resolveManagerIndex();
		const merged =
			structureSignature(env.s) !==
			structureSignature(stripManagerChild(preApply, managerIndex));
		const full = buildSharedImport(preApply, env.s, managerIndex);
		try {
			if (!importPaneState(this.pane, full)) {
				throw new Error('Incompatible shared state');
			}
		} catch {
			try {
				importPaneState(this.pane, preApply);
			} finally {
				this.sharePreviewActive = false;
				this.presets.setSharePreviewActive(false);
				this.sharePreviewOriginalState = null;
				this.persistence.resume();
				share.resume();
			}
			return;
		}
		this.pane.refresh();
		this.notifyStateApplied('share');

		if (!this.presetMenu) {
			// No preset UI to prompt with: best-effort keep the shared config.
			this.presets.acceptSharedImport(env);
			this.finishShareAccept();
			return;
		}

		this.presetMenu.showSharePrompt(
			{
				name: env.n,
				action: resolved.action,
				existingName: resolved.existingName,
				merged,
				reuseByContent: env.d || !env.id,
			},
			{
				onImport: (): void => {
					this.presets.acceptSharedImport(env);
					this.finishShareAccept();
				},
				onOverwrite: (): void => {
					if (typeof env.id === 'string') {
						this.presets.acceptSharedOverwrite(env.id);
					}
					this.finishShareAccept();
				},
				onDiscard: (): void => {
					this.discardSharePreview();
				},
			},
		);
	}

	/** Restores local values and unlocks presets when an incoming preview is discarded. */
	private discardSharePreview(): void {
		const original = this.sharePreviewOriginalState;
		if (!this.sharePreviewActive || !original) {
			this.urlShare?.clear();
			return;
		}
		this.sharePreviewActive = false;
		this.presets.setSharePreviewActive(false);
		this.sharePreviewOriginalState = null;
		importPaneState(this.pane, original);
		this.pane.refresh();
		this.notifyStateApplied('share-discard');
		this.urlShare?.clear();
		this.persistence.resume();
		this.urlShare?.resume();
		this.presetMenu?.dismissSharePrompt();
	}

	/** Common tail of accepting a shared preset: persist + resume + restamp URL. */
	private finishShareAccept(): void {
		this.sharePreviewActive = false;
		this.presets.setSharePreviewActive(false);
		this.sharePreviewOriginalState = null;
		this.pane.refresh();
		this.presetMenu?.refreshList();
		this.persistence.resume();
		// Persist the accepted (now live) state so a reload keeps it.
		this.persistence.saveNow();
		this.urlShare?.resume();
		void this.urlShare?.writeNow();
	}

	/**
	 * Builds the shareable URL for the current config WITHOUT changing the address
	 * bar. Resolves to the current location when URL sync is disabled.
	 */
	public shareUrl(): Promise<string> {
		if (!this.urlShare) {
			return Promise.resolve(
				typeof window !== 'undefined' ? window.location.href : '',
			);
		}
		return this.urlShare.buildUrl();
	}

	/**
	 * Writes the current config into the URL, copies it to the clipboard (when
	 * available), and returns it.
	 */
	public async copyShareLink(): Promise<string> {
		if (!this.urlShare) {
			return typeof window !== 'undefined' ? window.location.href : '';
		}
		const url = await this.urlShare.writeNow();
		try {
			if (typeof navigator !== 'undefined' && navigator.clipboard) {
				await navigator.clipboard.writeText(url);
			}
		} catch {
			// Clipboard unavailable (insecure context / denied): the URL is still in
			// the address bar and is returned to the caller.
		}
		return url;
	}

	/** Removes the share param from the URL (the "stop sharing" affordance). */
	public clearShareUrl(): void {
		this.discardSharePreview();
	}

	/** Switch presentation without recreating bindings or losing values/presets. */
	public setSidepanel(options: false | DriftpaneSidepanelOptions): void {
		if (this.disposed) return;
		this.sidepanel?.dispose();
		this.sidepanel = null;
		if (options) {
			this.draggable.disable();
			this.sidepanel = new SidepanelController(this.pane.element, options);
		} else if (this.draggableEnabled) {
			this.draggable.enable();
		}
	}

	/** Tears down the manager: removes listeners and added UI. */
	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.pane.element.removeEventListener(
			'click',
			this.preventHostFormSubmit,
			true,
		);
		if (this.sharePreviewOriginalState) {
			importPaneState(this.pane, this.sharePreviewOriginalState);
			this.sharePreviewOriginalState = null;
			this.sharePreviewActive = false;
			this.presets.setSharePreviewActive(false);
		}
		this.unsubscribePresets?.();
		this.persistence.dispose();
		this.sidepanel?.dispose();
		this.sidepanel = null;
		this.draggable.dispose();
		this.presetMenu?.dispose();
		this.theme.dispose();
		this.urlShare?.dispose();
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
