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
import { DraggableController } from './draggable.js';
import { PersistenceController } from './persistence.js';
import { PresetMenu } from './preset-menu.js';
import { PresetController } from './presets.js';
import { applyMaxHeight, clearMaxHeight } from './scroll.js';
import { buildSharedImport, childrenCount, stripManagerChild, stripReadonly, structureSignature, } from './state-scope.js';
import { DriftpaneStorage } from './storage.js';
import { injectStyles } from './styles.js';
import { ThemeController } from './theme-controller.js';
import { UrlShareController } from './url-share.js';
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
    defaultPosition: { x: 24, y: 24 },
    theme: 'auto',
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
    constructor(pane, opts) {
        const options = { ...DEFAULTS, ...(opts ?? {}) };
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
        // The preset folder is the LAST child of the pane (see preset-menu). The
        // scoping must therefore exclude the last index. We use a lazy resolver
        // (`() => last index`) instead of a constant: it is called only by the
        // controller methods (apply/save/restore), always AFTER the mount, when
        // exportState already includes the preset folder at the end. If presets are
        // disabled there is no manager folder: index -1 (nothing is excluded).
        this.managerChildIndex = this.presetsEnabled
            ? () => childrenCount(this.pane.exportState()) - 1
            : -1;
        // The PresetController is also needed by the menu: we always create it (it
        // is lightweight), but we mount the UI only if presetsEnabled.
        this.presets = new PresetController(pane, this.storage, {
            managerChildIndex: this.managerChildIndex,
        });
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
            // not the saved state). It is the target of "Restore".
            this.presets.ensureDefault(options.defaultPresetName);
        }
        else {
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
        if (this.draggableEnabled) {
            this.draggable.enable();
        }
        // (f) Height cap: ALWAYS active, so the panel never exceeds the viewport
        // and scrolls beyond the cap. Priority: user-persisted max-height (resize) >
        // maxHeightVh option > DEFAULT_MAX_HEIGHT default. The host is the root
        // panel (pane.element = .tp-rotv).
        this.maxHeightHost = pane.element;
        const persistedMaxHeight = this.storage.readJSON(MAXHEIGHT_KEY, null);
        const initialMaxHeight = typeof persistedMaxHeight === 'string' && persistedMaxHeight.trim() !== ''
            ? persistedMaxHeight
            : typeof options.maxHeightVh === 'number'
                ? `${options.maxHeightVh}vh`
                : DEFAULT_MAX_HEIGHT;
        applyMaxHeight(this.maxHeightHost, initialMaxHeight);
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
            if (this.urlShare.hasIncomingParam()) {
                // Keep sync suspended until the incoming prompt is resolved.
                this.urlShare.suspend();
                void this.handleIncomingShare();
            }
        }
        else {
            this.urlShare = null;
        }
    }
    /**
     * Sets the maximum height of the panel at runtime, and persists it. Beyond
     * the cap the panel becomes scrollable.
     * @param value Number = height in `vh`; string = any CSS length
     *   (e.g. '400px', 'calc(100dvh - 48px)'); `null` = restore the default
     *   (`calc(100dvh - 48px)`, 24px safe zone top/bottom) and forget the override.
     */
    setMaxHeight(value) {
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
    exportAllJSON() {
        const suffixes = [
            'state',
            'position',
            'width',
            'maxHeight',
            'theme',
            'presets',
        ];
        const data = {};
        for (const suffix of suffixes) {
            const value = this.storage.readJSON(suffix, null);
            if (value !== null) {
                data[suffix] = value;
            }
        }
        const envelope = {
            format: 'driftpane-backup',
            version: 1,
            namespace: this.storage.getNamespace(),
            exportedAt: new Date().toISOString(),
            data,
        };
        return JSON.stringify(envelope, null, 2);
    }
    /** Saves the current state as a new preset with the given name. */
    savePresetAs(name) {
        this.presets.save(name);
        this.presetMenu?.refreshList();
    }
    /** Applies a preset by id and updates the UI. */
    applyPreset(id) {
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
    resetState() {
        this.persistence.clear();
    }
    // --- URL sharing --------------------------------------------------------
    /**
     * Fires the consumer hook. Wrapped: a throwing callback must not break
     * startup, a preset apply, or a share prompt.
     */
    notifyStateApplied(reason) {
        if (!this.onStateApplied) {
            return;
        }
        try {
            this.onStateApplied(reason);
        }
        catch {
            // A consumer bug is not Driftpane's problem to propagate.
        }
    }
    /** Resolves the preset folder index (number or lazy resolver). */
    resolveManagerIndex() {
        return typeof this.managerChildIndex === 'function'
            ? this.managerChildIndex()
            : this.managerChildIndex;
    }
    /**
     * Handles an incoming shared link: applies the shared config as a live preview
     * (pausing persistence so the preview is never written), then prompts to
     * import/overwrite or discard. Async because decoding is async.
     */
    async handleIncomingShare() {
        const share = this.urlShare;
        if (!share) {
            return;
        }
        const incoming = await share.readIncoming();
        if (incoming.kind !== 'envelope') {
            // none / ignore / too-new: nothing to apply, just resume sync.
            share.resume();
            return;
        }
        const env = incoming.env;
        // Self-skip: if the shared state already equals our local state (e.g. our
        // OWN live-synced URL on reload, or an identical config), there is nothing
        // to import — don't prompt, just resume sync.
        const localStripped = JSON.stringify(stripReadonly(this.presets.currentSnapshot()));
        if (JSON.stringify(env.s) === localStripped) {
            share.resume();
            return;
        }
        const resolved = this.presets.resolveSharedAction(env);
        this.persistence.pause();
        const preApply = this.pane.exportState();
        const managerIndex = this.resolveManagerIndex();
        const merged = structureSignature(env.s) !==
            structureSignature(stripManagerChild(preApply, managerIndex));
        const full = buildSharedImport(preApply, env.s, managerIndex);
        this.pane.importState(full);
        this.pane.refresh();
        this.notifyStateApplied('share');
        if (!this.presetMenu) {
            // No preset UI to prompt with: best-effort keep the shared config.
            this.presets.acceptSharedImport(env);
            this.finishShareAccept();
            return;
        }
        this.presetMenu.showSharePrompt({
            name: env.n,
            action: resolved.action,
            existingName: resolved.existingName,
            merged,
        }, {
            onImport: () => {
                this.presets.acceptSharedImport(env);
                this.finishShareAccept();
            },
            onOverwrite: () => {
                if (typeof env.id === 'string') {
                    this.presets.acceptSharedOverwrite(env.id);
                }
                this.finishShareAccept();
            },
            onDiscard: () => {
                // Revert to the pre-open state, drop the param, resume everything.
                this.pane.importState(preApply);
                this.pane.refresh();
                this.notifyStateApplied('share-discard');
                share.clear();
                this.persistence.resume();
                share.resume();
                this.presetMenu?.refreshList();
            },
        });
    }
    /** Common tail of accepting a shared preset: persist + resume + restamp URL. */
    finishShareAccept() {
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
    shareUrl() {
        if (!this.urlShare) {
            return Promise.resolve(typeof window !== 'undefined' ? window.location.href : '');
        }
        return this.urlShare.buildUrl();
    }
    /**
     * Writes the current config into the URL, copies it to the clipboard (when
     * available), and returns it.
     */
    async copyShareLink() {
        if (!this.urlShare) {
            return typeof window !== 'undefined' ? window.location.href : '';
        }
        const url = await this.urlShare.writeNow();
        try {
            if (typeof navigator !== 'undefined' && navigator.clipboard) {
                await navigator.clipboard.writeText(url);
            }
        }
        catch {
            // Clipboard unavailable (insecure context / denied): the URL is still in
            // the address bar and is returned to the caller.
        }
        return url;
    }
    /** Removes the share param from the URL (the "stop sharing" affordance). */
    clearShareUrl() {
        this.urlShare?.clear();
    }
    /** Tears down the manager: removes listeners and added UI. */
    dispose() {
        this.persistence.dispose();
        this.draggable.dispose();
        this.presetMenu?.dispose();
        this.theme.dispose();
        this.urlShare?.dispose();
        clearMaxHeight(this.maxHeightHost);
    }
}
/** Functional helper: instantiates a Driftpane on an existing Pane. */
export function createDriftpane(pane, opts) {
    return new Driftpane(pane, opts);
}
//# sourceMappingURL=driftpane.js.map