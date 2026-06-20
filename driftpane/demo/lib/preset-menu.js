// Feature 4 (UI): builds the preset folder ALWAYS at the bottom of the pane
// (last, auto-injected entry) and wires the controls to the PresetController.
//
// The folder contains:
//  - (optional) a "Theme" selector;
//  - a list-blade selector of saved presets (custom ones with a small icon);
//  - row [Restore | Rename preset] (Restore discards changes, with a
//    confirmation if any are present);
//  - row [Save changes | Save as new] (confirmation on overwrite; the new one
//    proposes "<active> (copy)");
//  - row [Export | Import] (JSON);
//  - (optional) "Delete preset" (custom only, with confirmation, disabled if
//    the active preset is not deletable);
//  - (optional) "Reset position".
//
// The folder is inserted AT THE BOTTOM with `addBlade({view:'folder'})` without
// an `index`: the core appends it to the end of the rack, so it is the LAST
// child of the pane (and the last one in exportState). Since createDriftpane is
// called after building the pane, "at the bottom" = after all the user's controls.
/** Special selector entry when there is no selection. */
const NONE_VALUE = '__none__';
export class PresetMenu {
    constructor(pane, presets, opts) {
        this.folder = null;
        this.listBlade = null;
        this.fileInput = null;
        // Buttons whose disabled state depends on the active preset.
        this.saveChangesBtn = null;
        this.revertBtn = null;
        this.deleteBtn = null;
        this.pane = pane;
        this.presets = presets;
        this.opts = opts;
    }
    /**
     * Creates and mounts the preset folder AT THE BOTTOM of the pane (last child).
     * @returns the created FolderLike.
     */
    mount() {
        // No `index`: the core appends the folder at the end -> last child.
        const folder = this.pane.addBlade({
            view: 'folder',
            title: this.opts.folderTitle,
        });
        this.folder = folder;
        // THEME selector (optional): as the FIRST entry, before the preset selector.
        if (this.opts.themeController) {
            const themeController = this.opts.themeController;
            const themeBlade = folder.addBlade({
                view: 'list',
                label: 'Theme',
                options: [
                    { text: 'Auto', value: 'auto' },
                    { text: 'Light', value: 'light' },
                    { text: 'Dark', value: 'dark' },
                ],
                value: themeController.get(),
            });
            themeBlade.on('change', (ev) => {
                const value = ev.value;
                if (value === 'auto' || value === 'light' || value === 'dark') {
                    themeController.set(value);
                }
            });
        }
        // Preset selector (list-blade).
        this.listBlade = folder.addBlade({
            view: 'list',
            label: 'Preset',
            options: this.buildOptions(),
            value: this.presets.activeId() ?? NONE_VALUE,
        });
        this.listBlade?.on('change', (ev) => {
            const id = ev.value;
            if (typeof id === 'string' && id !== NONE_VALUE) {
                const ok = this.presets.apply(id);
                if (ok) {
                    this.opts.onAfterApply();
                }
                // The active preset has changed: realign the dependent buttons
                // (Save changes / Delete disabled on the Default, etc.).
                this.updateButtonStates();
            }
        });
        // Row: [Restore | Rename]. Restore discards live changes and returns to
        // the active preset (confirmation if any); disabled without an active preset.
        const revertBtn = folder.addButton({ title: 'Restore' });
        revertBtn.on('click', () => this.onRevert());
        this.markButton(revertBtn, 'dp-btn-revert');
        this.revertBtn = revertBtn;
        const renameBtn = folder.addButton({ title: 'Rename preset' });
        renameBtn.on('click', () => this.onRename());
        this.markButton(renameBtn, 'dp-btn-rename');
        this.groupIntoRow(revertBtn, renameBtn);
        // Row: [Save changes | Save as new].
        const saveChangesBtn = folder.addButton({ title: 'Save changes' });
        saveChangesBtn.on('click', () => this.onSaveChanges());
        this.markButton(saveChangesBtn, 'dp-btn-save');
        this.saveChangesBtn = saveChangesBtn;
        const saveNewBtn = folder.addButton({ title: 'Save as new' });
        saveNewBtn.on('click', () => this.onSaveNew());
        this.markButton(saveNewBtn, 'dp-btn-new');
        this.groupIntoRow(saveChangesBtn, saveNewBtn);
        // Row: [Export | Import].
        const exportBtn = folder.addButton({ title: 'Export' });
        exportBtn.on('click', () => this.onExport());
        this.markButton(exportBtn, 'dp-btn-export');
        const importBtn = folder.addButton({ title: 'Import' });
        importBtn.on('click', () => this.onImport());
        this.markButton(importBtn, 'dp-btn-import');
        this.groupIntoRow(exportBtn, importBtn);
        // Delete preset (optional): custom presets only, with confirmation, disabled
        // when the active preset is not deletable.
        if (this.opts.showDeletePreset) {
            const deleteBtn = folder.addButton({ title: 'Delete preset' });
            deleteBtn.on('click', () => this.onDelete());
            this.markButton(deleteBtn, 'dp-btn-delete');
            this.deleteBtn = deleteBtn;
        }
        // Optional button to reset the panel position.
        if (this.opts.onResetPosition) {
            const resetBtn = folder.addButton({ title: 'Reset position' });
            resetBtn.on('click', () => this.opts.onResetPosition?.());
            this.markButton(resetBtn, 'dp-btn-reset');
        }
        // Optional "Export all": full backup of the namespace's persisted state.
        if (this.opts.onExportAll) {
            const exportAllBtn = folder.addButton({ title: 'Export all' });
            exportAllBtn.on('click', () => this.onExportAll());
            this.markButton(exportAllBtn, 'dp-btn-export');
        }
        // Hidden file input for file-based import.
        this.fileInput = this.createFileInput();
        this.updateButtonStates();
        return folder;
    }
    /**
     * Rebuilds the selector options when the preset list changes.
     * Also updates the selected value to the current activeId.
     */
    refreshList() {
        if (!this.listBlade) {
            return;
        }
        this.listBlade.options = this.buildOptions();
        this.listBlade.value = this.presets.activeId() ?? NONE_VALUE;
        this.updateButtonStates();
    }
    /**
     * Updates the `disabled` state of the buttons that depend on the active
     * preset: "Save changes" and "Restore" require an active preset; "Delete"
     * requires the active preset to be deletable (custom).
     */
    updateButtonStates() {
        const hasActive = this.presets.activeId() !== null;
        // A CUSTOM preset is editable/deletable; the "Default" is not (baseline).
        const activeIsCustom = this.presets.isActiveDeletable();
        if (this.saveChangesBtn) {
            this.saveChangesBtn.disabled = !activeIsCustom;
        }
        if (this.revertBtn) {
            this.revertBtn.disabled = !hasActive;
        }
        if (this.deleteBtn) {
            this.deleteBtn.disabled = !activeIsCustom;
        }
    }
    /** Unmounts the menu and removes the hidden file input. */
    dispose() {
        if (this.fileInput && this.fileInput.parentNode) {
            this.fileInput.parentNode.removeChild(this.fileInput);
        }
        this.fileInput = null;
        this.folder?.dispose();
        this.folder = null;
        this.listBlade = null;
        this.saveChangesBtn = null;
        this.revertBtn = null;
        this.deleteBtn = null;
    }
    // --- Button icon/layout helpers -----------------------------------------
    /** Adds the icon classes to the button blade (if accessible). */
    markButton(btn, iconClass) {
        const el = btn.element;
        if (el) {
            el.classList.add('dp-btn-icon', iconClass);
        }
    }
    /**
     * Reusable "button row" system: moves the blades of N buttons into a single
     * flex row (.dp-btn-row) so they sit side by side and split the width
     * equally (e.g. Export | Import, but works for 2..N). The click handlers stay
     * valid because we move the same blade elements.
     * Returns the row element (or null in environments without blade DOM, e.g. tests).
     */
    groupIntoRow(...btns) {
        const els = btns.map((b) => b.element).filter((e) => !!e);
        const first = els[0];
        if (els.length < 2 || !first || !first.parentElement) {
            return null;
        }
        const doc = first.ownerDocument;
        const row = doc.createElement('div');
        row.className = 'dp-btn-row';
        first.parentElement.insertBefore(row, first);
        for (const el of els) {
            row.appendChild(el);
        }
        return row;
    }
    // --- Button handlers ----------------------------------------------------
    /**
     * "Restore": discards live changes and re-applies the active preset. If there
     * are changes it asks for confirmation; with no changes it is a silent no-op.
     */
    onRevert() {
        if (this.presets.activeId() === null) {
            return;
        }
        if (this.presets.isModified()) {
            const name = this.presets.activeName() ?? 'preset';
            if (!this.confirm(`Discard changes and return to "${name}"?`)) {
                return;
            }
        }
        if (this.presets.revert()) {
            this.opts.onAfterApply();
            this.refreshList();
        }
    }
    /** "Save changes": overwrites the active (custom) preset, after confirmation. */
    onSaveChanges() {
        // Disabled without an active preset or on the Default (non-overwritable baseline).
        if (!this.presets.isActiveDeletable()) {
            return;
        }
        const name = this.presets.activeName();
        if (name === null) {
            return;
        }
        if (!this.confirm(`Overwrite preset "${name}" with the changes?`)) {
            return;
        }
        if (this.presets.overwriteActive()) {
            this.refreshList();
            this.notify(`Preset "${name}" updated.`);
        }
    }
    /**
     * "Save as new": creates a new custom preset. Proposes the active preset name
     * with the " (copy)" suffix.
     */
    onSaveNew() {
        const name = this.promptName('New preset name:', this.presets.suggestedNewName());
        if (name === null) {
            return;
        }
        this.presets.save(name);
        this.refreshList();
    }
    /** "Delete preset": deletes the active preset if custom, after confirmation. */
    onDelete() {
        if (!this.presets.isActiveDeletable()) {
            return;
        }
        const name = this.presets.activeName() ?? 'preset';
        if (!this.confirm(`Delete preset "${name}"? This action is permanent.`)) {
            return;
        }
        if (this.presets.removeActive()) {
            // After deletion the active preset changes: realign the list and any
            // applied state.
            this.refreshList();
            this.opts.onAfterApply();
            this.notify(`Preset "${name}" deleted.`);
        }
    }
    /** "Rename preset": renames the currently selected preset. */
    onRename() {
        const activeId = this.presets.activeId();
        const current = activeId ? this.presets.get(activeId) : undefined;
        if (!activeId || !current) {
            this.notify('No preset selected to rename.');
            return;
        }
        const name = this.promptName('New name for the preset:', current.name);
        if (name === null) {
            return;
        }
        this.presets.rename(activeId, name);
        // `current` is the live reference: after rename it already has the new name.
        this.refreshList();
        this.notify(`Preset renamed to "${current.name}".`);
    }
    /** "Export": downloads the SELECTED preset as a .json file named after it. */
    onExport() {
        const id = this.presets.activeId();
        const preset = id ? this.presets.get(id) : undefined;
        if (!id || !preset) {
            this.notify('No preset selected to export.');
            return;
        }
        const json = this.presets.exportPresetJSON(id);
        this.downloadFile(`${this.safeFilename(preset.name)}.json`, json);
    }
    /** "Export all": downloads a full backup of the namespace's persisted state. */
    onExportAll() {
        const result = this.opts.onExportAll?.();
        if (!result) {
            return;
        }
        this.downloadFile(result.filename, result.content);
    }
    /**
     * Turns a preset name into a safe file name: drops path separators and chars
     * that browsers/OSes reject, collapses whitespace, strips leading dots. Falls
     * back to "preset" when nothing usable remains.
     */
    safeFilename(name) {
        const cleaned = name
            .trim()
            .replace(/[\\/:*?"<>|]/g, '-')
            .replace(/\s+/g, ' ')
            .replace(/^\.+/, '')
            .trim();
        return cleaned.length > 0 ? cleaned : 'preset';
    }
    /** "Import JSON": opens the file picker (with a text-prompt fallback). */
    onImport() {
        if (this.fileInput) {
            this.fileInput.value = '';
            this.fileInput.click();
        }
        else {
            this.importFromPrompt();
        }
    }
    // --- UI helpers ---------------------------------------------------------
    buildOptions() {
        const list = this.presets.list();
        const options = list.map((p) => ({
            // Bullet icon in front of the user's CUSTOM presets, so they are
            // distinguished from the default ones (provided by the app).
            text: p.custom !== false ? `• ${p.name}` : p.name,
            value: p.id,
        }));
        if (options.length === 0) {
            options.push({ text: '(no presets)', value: NONE_VALUE });
        }
        return options;
    }
    /**
     * Blocking confirmation (window.confirm) with a "true" fallback in
     * environments without window (e.g. tests/SSR): destructive actions are not
     * blocked but they are not silently skipped either.
     */
    confirm(message) {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
            return window.confirm(message);
        }
        return true;
    }
    createFileInput() {
        const doc = this.pane.element.ownerDocument;
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        // We do NOT use display:none: Firefox/Safari do NOT open the file picker
        // via .click() on a non-rendered input. We hide it off-screen, keeping it
        // "rendered" and clickable across all browsers.
        input.setAttribute('aria-hidden', 'true');
        input.tabIndex = -1;
        input.style.position = 'fixed';
        input.style.top = '0';
        input.style.left = '-9999px';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.opacity = '0';
        input.style.pointerEvents = 'none';
        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                const raw = String(reader.result ?? '');
                this.applyImport(raw);
            };
            reader.onerror = () => {
                this.notify('Error reading the file.');
            };
            reader.readAsText(file);
        });
        doc.body.appendChild(input);
        return input;
    }
    importFromPrompt() {
        if (typeof window === 'undefined' || !window.prompt) {
            return;
        }
        const raw = window.prompt('Paste the presets JSON to import:');
        if (raw) {
            this.applyImport(raw);
        }
    }
    applyImport(raw) {
        try {
            const { imported, ids } = this.presets.importJSON(raw);
            if (imported > 0 && ids.length > 0) {
                // Apply and select the first imported preset IMMEDIATELY: this way
                // the import has a visible effect on the panel (previously it was
                // only added to the list and "seemed to do nothing").
                const applied = this.presets.apply(ids[0]);
                this.refreshList();
                const name = this.presets.get(ids[0])?.name ?? 'preset';
                if (applied) {
                    this.opts.onAfterApply();
                    this.notify(imported === 1
                        ? `Imported and applied "${name}".`
                        : `Imported ${imported} presets. Applied "${name}".`);
                }
                else {
                    this.notify(`Imported ${imported} presets.`);
                }
            }
            else {
                this.refreshList();
                this.notify('No valid presets found in the file.');
            }
        }
        catch {
            // Malformed input: no exception propagated, just a warning.
            this.notify('Import failed: invalid JSON.');
        }
    }
    downloadFile(filename, content) {
        const doc = this.pane.element.ownerDocument;
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = doc.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        doc.body.appendChild(anchor);
        anchor.click();
        doc.body.removeChild(anchor);
        // Release the URL on the next tick to give the download time to start.
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
    promptName(message, fallback) {
        if (typeof window !== 'undefined' && window.prompt) {
            const value = window.prompt(message, fallback);
            return value;
        }
        return fallback;
    }
    notify(message) {
        if (typeof console !== 'undefined') {
            console.info(`[Driftpane] ${message}`);
        }
        // Visible, non-blocking, auto-dismissible toast: every action
        // (import/rename/...) should give clear on-screen feedback.
        try {
            const doc = this.pane.element.ownerDocument;
            if (!doc || !doc.body) {
                return;
            }
            const toast = doc.createElement('div');
            toast.textContent = message;
            toast.setAttribute('data-driftpane-toast', '');
            const s = toast.style;
            s.position = 'fixed';
            s.top = '16px';
            s.left = '50%';
            s.transform = 'translateX(-50%)';
            s.zIndex = '2147483647';
            s.maxWidth = '80vw';
            s.padding = '8px 14px';
            s.borderRadius = '4px';
            s.background = 'rgba(18, 18, 20, 0.92)';
            s.color = '#ededee';
            s.border = '1px solid rgba(255, 255, 255, 0.14)';
            s.font =
                '13px "Geist", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
            s.boxShadow = '0 10px 34px rgba(0, 0, 0, 0.5)';
            s.backdropFilter = 'blur(8px)';
            s.pointerEvents = 'none';
            s.opacity = '0';
            s.transition = 'opacity 0.18s ease';
            doc.body.appendChild(toast);
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => {
                    toast.style.opacity = '1';
                });
            }
            else {
                toast.style.opacity = '1';
            }
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 220);
            }, 2400);
        }
        catch {
            // Non-browser environment: we just rely on the console.info already emitted.
        }
    }
}
//# sourceMappingURL=preset-menu.js.map