// TypeScript source of the Driftpane demo.
//
// Builds a Pane with a COMPLETE CATALOG of every control in the Tweakpane 4.0.5
// core (inputs, blades, monitors, nested folders, tabs) and passes it to
// `createDriftpane(...)`, which enables the 4 features (value persistence +
// expanded/collapsed state including nested sub-panels, persistent drag, presets).
//
// IMPORT NOTE: in production this would be `import {Pane} from 'tweakpane'`
// resolved from the workspace package; here the 'tweakpane' specifier is mapped
// via an import-map (in the HTML) to the ESM 4.0.5 build on a CDN, so the demo
// runs without building the monorepo. The Driftpane layer comes from its own
// local build (./lib/index.js).
import { Pane } from 'tweakpane';
import { createDriftpane } from './lib/index.js';
// --- Parameters that drive the canvas preview (showcase persistence) ---
const PARAMS = {
    theme: 'dark',
    speed: 0.6,
    amplitude: 48,
    wave: 'sine',
    background: '#0c0c0e',
    foreground: '#cfcfd6',
    thickness: 3,
    glow: true,
    detail: 2,
    seed: 42,
    label: 'Driftpane',
};
// --- Values for the catalog of ALL controls (for demonstration only) ---
const CAT = {
    numSlider: 50,
    numStep: 4,
    numText: 1234.5,
    numFmt: 0.5,
    numList: 1,
    bool: true,
    str: 'hello',
    strList: 'b',
    colHex: '#c8ccd4',
    colHexA: '#c8ccd4aa',
    colRgb: { r: 150, g: 158, b: 172 },
    colRgba: { r: 200, g: 205, b: 214, a: 0.6 },
    colInline: '#9aa0ab',
    p2: { x: 24, y: -16 },
    p3: { x: 0, y: 1, z: 2 },
    p4: { x: 0, y: 0, z: 0, w: 1 },
};
// --- Monitored (readonly) values, animated by the canvas loop ---
const MON = {
    sine: 0,
    fps: 0,
    running: true,
    log: 'starting…',
};
// --- Theme (dark/light) ------------------------------------------------------
// Scene (canvas) colors for each theme; the UI theme is handled by a data-theme
// attribute on <html> (see CSS in index.html).
const THEME_COLORS = {
    dark: { background: '#0c0c0e', foreground: '#cfcfd6' },
    // "Apple" light: very light neutral gray background, wave in a soft gray
    // (systemGray2) for a very minimal look instead of a high-contrast stroke.
    light: { background: '#f5f5f7', foreground: '#aeaeb2' },
};
/**
 * Applies the theme: sets the attribute on <html> and, optionally, realigns the
 * scene colors to the theme defaults (true when the user changes theme; false on
 * restore, where the colors already come from the saved state).
 */
function setTheme(t, updateSceneColors = true) {
    document.documentElement.dataset.theme = t;
    if (updateSceneColors) {
        PARAMS.background = THEME_COLORS[t].background;
        PARAMS.foreground = THEME_COLORS[t].foreground;
        pane.refresh();
    }
}
// --- Building the Pane (public Tweakpane API only) ---
const pane = new Pane({ title: 'Driftpane' });
// Folder 1: Preview (drives the canvas) with a NESTED and SUB-nested folder, to
// demonstrate the recursive persistence of the expanded/collapsed state.
const fPrev = pane.addFolder({ title: 'Preview', expanded: true });
fPrev
    .addBinding(PARAMS, 'theme', { options: { Dark: 'dark', Light: 'light' } })
    .on('change', (ev) => setTheme(ev.value));
fPrev.addBinding(PARAMS, 'speed', { min: 0, max: 2, step: 0.01 });
fPrev.addBinding(PARAMS, 'amplitude', { min: 0, max: 120, step: 1 });
fPrev.addBinding(PARAMS, 'wave', {
    options: { Sine: 'sine', Square: 'square', Triangle: 'triangle' },
});
fPrev.addBinding(PARAMS, 'background');
fPrev.addBinding(PARAMS, 'foreground');
fPrev.addBinding(PARAMS, 'glow');
const fStroke = fPrev.addFolder({ title: 'Stroke', expanded: false });
fStroke.addBinding(PARAMS, 'thickness', { min: 1, max: 12, step: 1 });
const fDetail = fStroke.addFolder({ title: 'Details', expanded: false });
fDetail.addBinding(PARAMS, 'detail', { min: 1, max: 8, step: 1 });
fDetail.addBinding(PARAMS, 'seed', { min: 0, max: 100, step: 1 });
// Catalog of controls organized in a TAB with multiple pages.
const tab = pane.addTab({
    pages: [
        { title: 'Numbers' },
        { title: 'Text' },
        { title: 'Colors' },
        { title: 'Points' },
        { title: 'Blade' },
        { title: 'Monitor' },
    ],
});
// "Numbers" page: slider, stepped slider, text field, custom format, dropdown.
tab.pages[0].addBinding(CAT, 'numSlider', { min: 0, max: 100, step: 1 });
tab.pages[0].addBinding(CAT, 'numStep', { min: 0, max: 10, step: 2 });
tab.pages[0].addBinding(CAT, 'numText'); // no min/max -> numeric field
tab.pages[0].addBinding(CAT, 'numFmt', {
    min: 0,
    max: 1,
    format: (v) => v.toFixed(3),
});
tab.pages[0].addBinding(CAT, 'numList', {
    options: { Low: 0, Medium: 1, High: 2 },
});
// "Text" page: checkbox, text field, string dropdown.
tab.pages[1].addBinding(CAT, 'bool');
tab.pages[1].addBinding(CAT, 'str');
tab.pages[1].addBinding(CAT, 'strList', {
    options: { Alpha: 'a', Beta: 'b', Gamma: 'c' },
});
// "Colors" page: hex, hex+alpha, rgb object, rgba object, inline picker.
tab.pages[2].addBinding(CAT, 'colHex');
tab.pages[2].addBinding(CAT, 'colHexA');
tab.pages[2].addBinding(CAT, 'colRgb');
tab.pages[2].addBinding(CAT, 'colRgba');
tab.pages[2].addBinding(CAT, 'colInline', { picker: 'inline', expanded: true });
// "Points" page: 2D point (y inverted), 3D, 4D.
tab.pages[3].addBinding(CAT, 'p2', {
    x: { min: -50, max: 50 },
    y: { min: -50, max: 50, inverted: true },
});
tab.pages[3].addBinding(CAT, 'p3');
tab.pages[3].addBinding(CAT, 'p4');
// "Blade" page: slider/text/list/separator blade + button + nested folder.
tab.pages[4].addBlade({ view: 'slider', label: 'slider', min: 0, max: 100, value: 30 });
tab.pages[4].addBlade({
    view: 'text',
    label: 'text',
    parse: (v) => v,
    value: 'blade',
});
tab.pages[4].addBlade({
    view: 'list',
    label: 'list',
    options: [
        { text: 'One', value: 1 },
        { text: 'Two', value: 2 },
    ],
    value: 1,
});
tab.pages[4].addBlade({ view: 'separator' });
tab.pages[4].addButton({ title: 'Button' }).on('click', () => {
    console.info('[demo] button click');
});
const fInTab = tab.pages[4].addFolder({ title: 'Folder in tab', expanded: false });
fInTab.addBinding(CAT, 'numSlider', { min: 0, max: 100 });
// "Monitor" page (readonly): graph, number, boolean, multiline string.
tab.pages[5].addBinding(MON, 'sine', { readonly: true, view: 'graph', min: -1, max: 1 });
tab.pages[5].addBinding(MON, 'fps', { readonly: true });
tab.pages[5].addBinding(MON, 'running', { readonly: true });
tab.pages[5].addBinding(MON, 'log', { readonly: true, multiline: true, rows: 3 });
// Final folder: text + buttons.
const fAdv = pane.addFolder({ title: 'Advanced', expanded: false });
fAdv.addBinding(PARAMS, 'label');
fAdv.addButton({ title: 'Log current state' }).on('click', () => {
    console.info('[demo] exportState():', pane.exportState());
});
// --- Hooking up the Driftpane manager: one line, all 4 features ---
const panel = createDriftpane(pane, {
    storageNamespace: 'demo',
    debounceMs: 300,
    draggable: true,
    presetsEnabled: true,
    presetFolderTitle: 'Preset',
    clampToViewport: true,
    defaultPosition: { x: 16, y: 16 },
    // Show ALL optional controls of the preset menu (hidden by default):
    // theme selector, "Reset position" and "Delete preset".
    showThemeControl: true,
    showResetPosition: true,
    showDeletePreset: true,
});
// Exposed for manual inspection from the browser console.
window.driftpane = panel;
// NB: the fold height when opening/closing is handled entirely via CSS in
// index.html with `interpolate-size: allow-keywords` (native height 0 <-> auto
// transition). This way we do not depend on Tweakpane's measurement
// (computeExpandedFolderHeight, often imprecise) and the panel lands on the real
// height without jumps.
// Apply the restored theme (the attribute on <html>); the scene colors already
// come from the persisted state, so we do not touch them here.
setTheme(PARAMS.theme, false);
// --- Live canvas preview: reflects the parameters and reappears on refresh ---
const canvas = document.getElementById('preview');
if (canvas) {
    const ctx = canvas.getContext('2d');
    const resize = () => {
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(canvas.clientWidth * ratio);
        canvas.height = Math.floor(canvas.clientHeight * ratio);
        if (ctx) {
            ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        }
    };
    resize();
    window.addEventListener('resize', resize);
    const waveValue = (phase) => {
        switch (PARAMS.wave) {
            case 'square':
                return Math.sign(Math.sin(phase));
            case 'triangle':
                return (2 / Math.PI) * Math.asin(Math.sin(phase));
            case 'sine':
            default:
                return Math.sin(phase);
        }
    };
    let t = 0;
    let frames = 0;
    let lastFpsAt = performance.now();
    const draw = () => {
        if (!ctx) {
            return;
        }
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        ctx.fillStyle = PARAMS.background;
        ctx.fillRect(0, 0, w, h);
        ctx.lineWidth = PARAMS.thickness;
        ctx.strokeStyle = PARAMS.foreground;
        if (PARAMS.glow) {
            ctx.shadowColor = PARAMS.foreground;
            ctx.shadowBlur = 16;
        }
        else {
            ctx.shadowBlur = 0;
        }
        ctx.beginPath();
        const mid = h / 2;
        for (let x = 0; x <= w; x += 2) {
            const phase = (x / w) * Math.PI * 2 * PARAMS.detail + t + PARAMS.seed * 0.1;
            const y = mid + waveValue(phase) * PARAMS.amplitude;
            if (x === 0) {
                ctx.moveTo(x, y);
            }
            else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Update the monitored values (readonly in the panel).
        t += 0.02 * PARAMS.speed;
        MON.sine = Math.sin(t * 2);
        frames++;
        const now = performance.now();
        if (now - lastFpsAt >= 500) {
            MON.fps = Math.round((frames * 1000) / (now - lastFpsAt));
            MON.log = `fps ${MON.fps} · t ${t.toFixed(1)} · wave ${PARAMS.wave}`;
            frames = 0;
            lastFpsAt = now;
        }
        requestAnimationFrame(draw);
    };
    requestAnimationFrame(draw);
}
//# sourceMappingURL=main.js.map