// The showcase deliberately uses the public package API, just like a consumer.
// The import map supplies Tweakpane; build.sh compiles src/ into demo/lib/.
import {Pane} from 'tweakpane';
import {
	createDriftpane,
	DriftpaneApplyReason,
	DriftpaneTheme,
} from './lib/index.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
	const element = document.getElementById(id);
	if (!element) throw new Error(`Missing demo element: ${id}`);
	return element as T;
};
const receiver = new URL(location.href).searchParams.get('receiver') === '1';
const namespace = receiver ? 'showcase-receiver' : 'showcase';
const narrow = matchMedia('(max-width: 760px)').matches;
$('namespace-label').textContent = `namespace / ${namespace}`;
$('receiver-banner').hidden = !receiver;

const PARAMS = {
	speed: 0.6,
	amplitude: 48,
	wave: 'sine',
	background: '#141419',
	foreground: '#c4c8f1',
	thickness: 2,
	glow: true,
	detail: 2,
	seed: 42,
	label: 'Driftpane',
};
const CAT = {
	slider: 50,
	step: 4,
	number: 1234.5,
	precision: 0.5,
	quality: 1,
	enabled: true,
	text: 'Hello, Driftpane',
	choice: 'b',
	color: '#98a5cd',
	alpha: '#bca4ffaa',
	rgb: {r: 150, g: 158, b: 172},
	rgba: {r: 200, g: 205, b: 214, a: 0.6},
	inline: '#9aa0ab',
	point: {x: 24, y: -16},
	vector3: {x: 0, y: 1, z: 2},
	vector4: {x: 0, y: 0, z: 0, w: 1},
};
const MON = {
	signal: 0,
	fps: 0,
	running: true,
	log: 'Waiting for the next frame…',
};
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function notice(message: string): void {
	$('demo-notice').textContent = message;
	$('demo-notice').hidden = false;
	clearTimeout(noticeTimer);
	noticeTimer = setTimeout(() => {
		$('demo-notice').hidden = true;
	}, 6000);
}
const applyEvents: {reason: DriftpaneApplyReason; time: string}[] = [];
function recordApply(reason: DriftpaneApplyReason): void {
	applyEvents.unshift({
		reason,
		time: new Date().toLocaleTimeString([], {hour12: false}),
	});
	applyEvents.splice(5);
	const log = $('event-log');
	log.replaceChildren();
	for (const event of applyEvents) {
		const row = document.createElement('li');
		const name = document.createElement('span');
		name.textContent = event.reason;
		const time = document.createElement('time');
		time.textContent = event.time;
		row.append(name, time);
		log.append(row);
	}
}
const pane = new Pane({
	title: 'Driftpane',
	container: $('main-panel'),
	expanded: !narrow,
});
const scene = pane.addFolder({title: 'Signal', expanded: true});
scene.addBinding(PARAMS, 'speed', {label: 'Speed', min: 0, max: 2, step: 0.01});
scene.addBinding(PARAMS, 'amplitude', {
	label: 'Amplitude',
	min: 0,
	max: 100,
	step: 1,
});
scene.addBinding(PARAMS, 'wave', {
	label: 'Wave',
	options: {Sine: 'sine', Triangle: 'triangle', Square: 'square'},
});
const foreground = scene.addBinding(PARAMS, 'foreground', {label: 'Ink'});
scene.addBinding(PARAMS, 'background', {label: 'Canvas'});
scene.addBinding(PARAMS, 'glow', {label: 'Glow'});
const stroke = scene.addFolder({title: 'Stroke', expanded: false});
stroke.addBinding(PARAMS, 'thickness', {
	label: 'Thickness',
	min: 1,
	max: 10,
	step: 1,
});
const details = stroke.addFolder({title: 'Details', expanded: false});
details.addBinding(PARAMS, 'detail', {
	label: 'Frequency',
	min: 1,
	max: 8,
	step: 1,
});
details.addBinding(PARAMS, 'seed', {label: 'Seed', min: 0, max: 100, step: 1});
details.addBinding(PARAMS, 'label', {label: 'Name'});
const gallery = pane.addFolder({title: 'Control gallery', expanded: false});
const tabNames = ['Numbers', 'Text', 'Colors', 'Points', 'Blades', 'Live'];
const tabs = gallery.addTab({pages: tabNames.map((title) => ({title}))});
tabs.pages[0].addBinding(CAT, 'slider', {min: 0, max: 100, step: 1});
tabs.pages[0].addBinding(CAT, 'step', {min: 0, max: 10, step: 2});
tabs.pages[0].addBinding(CAT, 'number');
tabs.pages[0].addBinding(CAT, 'precision', {
	min: 0,
	max: 1,
	format: (v: number) => v.toFixed(3),
});
tabs.pages[0].addBinding(CAT, 'quality', {
	options: {Low: 0, Medium: 1, High: 2},
});
tabs.pages[1].addBinding(CAT, 'enabled');
tabs.pages[1].addBinding(CAT, 'text');
tabs.pages[1].addBinding(CAT, 'choice', {
	options: {Alpha: 'a', Beta: 'b', Gamma: 'c'},
});
for (const key of ['color', 'alpha', 'rgb', 'rgba'])
	tabs.pages[2].addBinding(CAT, key);
tabs.pages[2].addBinding(CAT, 'inline', {picker: 'inline', expanded: true});
const point = tabs.pages[3].addBinding(CAT, 'point', {
	x: {min: -50, max: 50},
	y: {min: -50, max: 50, inverted: true},
});
tabs.pages[3].addBinding(CAT, 'vector3');
tabs.pages[3].addBinding(CAT, 'vector4');
tabs.pages[4].addBlade({
	view: 'slider',
	label: 'Slider',
	min: 0,
	max: 100,
	value: 30,
});
tabs.pages[4].addBlade({
	view: 'text',
	label: 'Text',
	parse: (v: string) => v,
	value: 'A saved blade',
});
tabs.pages[4].addBlade({
	view: 'list',
	label: 'List',
	options: [
		{text: 'One', value: 1},
		{text: 'Two', value: 2},
	],
	value: 1,
});
tabs.pages[4].addBlade({view: 'separator'});
tabs.pages[4]
	.addButton({title: 'Say hello'})
	.on('click', () => notice('Tweakpane buttons work as usual.'));
const inTab = tabs.pages[4].addFolder({
	title: 'A folder inside a tab',
	expanded: false,
});
inTab.addBinding(CAT, 'slider', {min: 0, max: 100, label: 'Shared slider'});
tabs.pages[5].addBinding(MON, 'signal', {
	readonly: true,
	view: 'graph',
	min: -1,
	max: 1,
	interval: 50,
});
tabs.pages[5].addBinding(MON, 'fps', {readonly: true, interval: 100});
tabs.pages[5].addBinding(MON, 'running', {readonly: true});
tabs.pages[5].addBinding(MON, 'log', {
	readonly: true,
	multiline: true,
	rows: 3,
});

const panel = createDriftpane(pane, {
	storageNamespace: namespace,
	debounceMs: 300,
	width: 304,
	sidepanel: {mode: 'push', side: 'right', width: 304, open: !narrow},
	maxHeightVh: narrow ? 65 : 75,
	defaultPosition: {x: narrow ? 16 : 24, y: narrow ? 80 : 140},
	draggable: true,
	resizableWidth: true,
	resizableHeight: true,
	clampToViewport: true,
	presetsEnabled: true,
	presetFolderTitle: 'Presets',
	showThemeControl: true,
	showResetPosition: true,
	showDeletePreset: true,
	showExportAll: true,
	urlSync: true,
	urlParamKey: 'dp',
	onStateApplied: recordApply,
});

// Separate namespace, intentionally embedded with service controls disabled.
const secondaryParams = {gain: 0.3, accent: '#686e9c', offset: 0};
const secondaryNamespace = `${namespace}-independent`;
const dynamicKey = `driftpane-demo:${secondaryNamespace}:extra`;
const secondaryPane = new Pane({
	title: 'Independent panel',
	container: $('secondary-panel'),
});
secondaryPane.addBinding(secondaryParams, 'gain', {
	min: 0,
	max: 1,
	step: 0.01,
	label: 'Gain',
});
secondaryPane.addBinding(secondaryParams, 'accent', {label: 'Accent'});
let runtimeFolder: ReturnType<Pane['addFolder']> | undefined;
function addRuntimeFolder(): void {
	runtimeFolder = secondaryPane.addFolder({
		title: 'Added at runtime',
		expanded: true,
	});
	runtimeFolder.addBinding(secondaryParams, 'offset', {
		label: 'Phase',
		min: -3,
		max: 3,
		step: 0.01,
	});
	$('add-control').textContent = 'Runtime controls added';
	($('add-control') as HTMLButtonElement).disabled = true;
}
try {
	if (localStorage.getItem(dynamicKey) === '1') addRuntimeFolder();
} catch {
	/* Storage can be unavailable. */
}
const independent = createDriftpane(secondaryPane, {
	storageNamespace: secondaryNamespace,
	draggable: false,
	presetsEnabled: false,
	urlSync: false,
	resizableWidth: false,
	resizableHeight: false,
	theme: 'dark',
	maxHeightVh: 40,
});
$('add-control').addEventListener('click', () => {
	if (runtimeFolder) return;
	addRuntimeFolder();
	try {
		localStorage.setItem(dynamicKey, '1');
	} catch {
		/* Runtime controls still work. */
	}
	notice(
		'A folder was added after initialization. Change its phase, fold it, then reload.',
	);
});
$('secondary-theme').addEventListener('click', () =>
	independent.theme.set(
		independent.theme.resolved() === 'dark' ? 'light' : 'dark',
	),
);

function show(element: HTMLElement): void {
	panel.sidepanel?.open();
	pane.expanded = true;
	// Wait for the actual folder/pane animation before scrolling inside the panel.
	setTimeout(
		() => element.scrollIntoView({block: 'nearest', inline: 'nearest'}),
		550,
	);
}
function showPresets(): void {
	const folder = pane.children.find(
		(child) => 'title' in child && child.title === 'Presets',
	);
	if (folder && 'expanded' in folder) folder.expanded = true;
	if (folder) show(folder.element);
}
function updateTheme(): void {
	document.documentElement.dataset.theme = panel.theme.resolved();
	$('theme-status').textContent =
		`${panel.theme.get()} → ${panel.theme.resolved()}`;
	for (const button of document.querySelectorAll<HTMLButtonElement>(
		'[data-theme-choice]',
	)) {
		button.setAttribute(
			'aria-pressed',
			String(button.dataset.themeChoice === panel.theme.get()),
		);
	}
}
const themeObserver = new MutationObserver(updateTheme);
themeObserver.observe(pane.element, {
	attributes: true,
	attributeFilter: ['data-theme'],
});
panel.theme.subscribe(updateTheme);
updateTheme();
for (const button of document.querySelectorAll<HTMLButtonElement>(
	'[data-theme-choice]',
)) {
	button.addEventListener('click', () =>
		panel.theme.set(button.dataset.themeChoice as DriftpaneTheme),
	);
}
function shuffle(): void {
	PARAMS.speed = Math.round((0.25 + Math.random() * 1.5) * 100) / 100;
	PARAMS.amplitude = Math.round(20 + Math.random() * 65);
	PARAMS.seed = Math.floor(Math.random() * 100);
	PARAMS.foreground = ['#c4c8f1', '#e6bd9c', '#a6d8c8', '#ddacca'][
		Math.floor(Math.random() * 4)
	];
	pane.refresh();
}
$('shuffle').addEventListener('click', shuffle);
$('toggle-panel').addEventListener('click', () => {
	if (panel.sidepanel) {
		pane.expanded = true;
		panel.sidepanel.toggle();
	} else pane.expanded = !pane.expanded;
});
function changePresentation(): void {
	const mode = $<HTMLSelectElement>('panel-presentation').value;
	const side = $<HTMLSelectElement>('panel-side').value as 'left' | 'right';
	panel.setSidepanel(
		mode === 'floating'
			? false
			: {
					mode: mode as 'hover' | 'push',
					side,
					width: Number($<HTMLSelectElement>('panel-width').value),
				},
	);
	pane.expanded = true;
	document.body.classList.toggle('demo-sidepanel', mode !== 'floating');
	for (const id of ['drag-toggle', 'reset-position', 'panel-height']) {
		$<HTMLButtonElement>(id).disabled = mode !== 'floating';
	}
}
$('panel-presentation').addEventListener('change', changePresentation);
$('panel-side').addEventListener('change', changePresentation);

document.body.classList.add('demo-sidepanel');
for (const id of ['drag-toggle', 'reset-position', 'panel-height'])
	$<HTMLButtonElement>(id).disabled = true;
$('reload').addEventListener('click', () => location.reload());
$('reset-state').addEventListener('click', () => {
	panel.resetState();
	panel.clearShareUrl();
	location.reload();
});
$('panel-width').addEventListener('change', () =>
	(panel.sidepanel ?? panel.draggable).setWidth(
		Number($<HTMLSelectElement>('panel-width').value),
	),
);
$('panel-height').addEventListener('change', () => {
	const value = $<HTMLSelectElement>('panel-height').value;
	panel.setMaxHeight(
		value === 'default' ? null : value.endsWith('px') ? value : Number(value),
	);
});
$('reset-position').addEventListener('click', () =>
	panel.draggable.resetPosition(),
);
let dragging = true;
$('drag-toggle').addEventListener('click', () => {
	dragging = !dragging;
	if (dragging) panel.draggable.enable();
	else panel.draggable.disable();
	$('drag-toggle').textContent = dragging ? 'Dragging on' : 'Dragging off';
	$('drag-toggle').setAttribute('aria-pressed', String(dragging));
});
$('nested-folds').addEventListener('click', () => {
	scene.expanded = true;
	stroke.expanded = true;
	details.expanded = true;
	show(details.element);
});
$('next-tab').addEventListener('click', () => {
	gallery.expanded = true;
	const next =
		(tabs.pages.findIndex((page) => page.selected) + 1) % tabs.pages.length;
	tabs.pages[next].selected = true;
	show(tabs.element);
});
$('save-preset').addEventListener('click', () => {
	const name = $<HTMLInputElement>('preset-name').value.trim();
	if (!name) {
		notice('Give your preset a name first.');
		return;
	}
	panel.savePresetAs(name);
	notice(`Saved “${name}”. Edit the signal, then Restore active.`);
});
$('restore-preset').addEventListener('click', () => {
	const id = panel.presets.activeId();
	if (id) panel.applyPreset(id);
});
$('show-presets').addEventListener('click', showPresets);
function openPicker(binding: {element: HTMLElement}, selector: string): void {
	panel.setMaxHeight(45);
	show(binding.element);
	setTimeout(
		() => binding.element.querySelector<HTMLButtonElement>(selector)?.click(),
		600,
	);
}
$('open-color').addEventListener('click', () => {
	scene.expanded = true;
	openPicker(foreground, '.tp-colswv_b');
});
$('open-point').addEventListener('click', () => {
	gallery.expanded = true;
	tabs.pages[3].selected = true;
	openPicker(point, '.tp-p2dv_b');
});
$('default-height').addEventListener('click', () => panel.setMaxHeight(null));
const shareField = $<HTMLTextAreaElement>('share-link');
let displayedUrl = location.href;
function revealLink(url: string): void {
	shareField.value = url;
	displayedUrl = location.href;
}
$('build-link').addEventListener(
	'click',
	() =>
		void panel
			.shareUrl()
			.then(revealLink)
			.catch(() => notice('Could not build this link.')),
);
$('copy-link').addEventListener(
	'click',
	() =>
		void (async () => {
			const url = await panel.copyShareLink();
			revealLink(url);
			// Expose the returned link even when clipboard permission is unavailable.
			try {
				await navigator.clipboard.writeText(url);
				notice('Share link copied.');
			} catch {
				shareField.focus();
				shareField.select();
				notice('Link ready. Copy the selected text to share it.');
			}
		})().catch(() => notice('Could not create this link.')),
);
$('clear-link').addEventListener('click', () => {
	panel.clearShareUrl();
	shareField.value = '';
	displayedUrl = location.href;
	notice('Share parameter cleared. A new edit starts sync again.');
});
$('open-receiver').addEventListener('click', () => {
	// Open synchronously inside the gesture so popup blockers do not reject it.
	const target = window.open('about:blank', '_blank');
	if (!target) {
		notice('Allow this tab to open the receiver sandbox.');
		return;
	}
	target.opener = null;
	void panel
		.shareUrl()
		.then((link) => {
			const url = new URL(link);
			const payload = url.searchParams.get(`dp:${namespace}`);
			url.searchParams.delete(`dp:${namespace}`);
			url.searchParams.set('receiver', '1');
			if (payload) url.searchParams.set('dp:showcase-receiver', payload);
			target.location.href = url.toString();
		})
		.catch(() => {
			target.close();
			notice('Could not open the receiver.');
		});
});
function download(name: string, content: string): void {
	const url = URL.createObjectURL(
		new Blob([content], {type: 'application/json'}),
	);
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = name;
	anchor.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('export-backup').addEventListener('click', () =>
	download(`driftpane-${namespace}-backup.json`, panel.exportAllJSON()),
);
const backupInput = $<HTMLInputElement>('backup-file');
$('import-backup').addEventListener('click', () => backupInput.click());
backupInput.addEventListener('change', () => {
	const file = backupInput.files?.[0];
	backupInput.value = '';
	if (!file) return;
	void file
		.text()
		.then((raw) => {
			panel.importAllJSON(raw);
			notice('Backup restored: values, navigation, layout, theme and presets.');
		})
		.catch((error) =>
			notice(
				error instanceof Error
					? error.message
					: 'Could not import this backup.',
			),
		);
});

function bindingValue(state: unknown, key: string): unknown {
	if (!state || typeof state !== 'object') return undefined;
	const node = state as Record<string, unknown>;
	const binding = node.binding as {key?: string; value?: unknown} | undefined;
	if (binding?.key === key) return binding.value;
	for (const child of Array.isArray(node.children) ? node.children : []) {
		const value = bindingValue(child, key);
		if (value !== undefined) return value;
	}
	return undefined;
}
let lastStatus = '';
function updateStatus(): void {
	const active = panel.presets
		.list()
		.find((preset) => preset.id === panel.presets.activeId());
	$('active-preset').textContent =
		`${active?.name ?? 'None'}${panel.presets.isModified() ? ' · edited' : ''}`;
	const position = panel.draggable.getPosition();
	$('layout-status').textContent = panel.sidepanel
		? `${panel.sidepanel.element.dataset.side} · ${panel.sidepanel.element.dataset.mode} · ${panel.sidepanel.isOpen ? 'open' : 'closed'}`
		: `${Math.round(pane.element.getBoundingClientRect().width)}px · ${Math.round(position.x)}, ${Math.round(position.y)}`;
	const currentPage = tabs.pages.findIndex((page) => page.selected);
	$('tab-status').textContent = tabNames[currentPage] ?? '—';
	try {
		const raw = localStorage.getItem(`driftpane:${namespace}:state`);
		const saved = raw ? bindingValue(JSON.parse(raw), 'speed') : undefined;
		$('saved-speed').textContent =
			typeof saved === 'number' ? `${saved.toFixed(2)}×` : 'No snapshot yet';
		const preview = Boolean(pane.element.querySelector('.dp-share-card'));
		const status = preview
			? 'Preview · not saved'
			: saved === undefined
				? 'Ready for your first edit'
				: saved === PARAMS.speed
					? 'Saved locally'
					: 'Saving…';
		if (status !== lastStatus) {
			$('storage-status').textContent = status;
			lastStatus = status;
		}
	} catch {
		$('storage-status').textContent = 'Storage unavailable';
	}
	if (location.href !== displayedUrl) {
		displayedUrl = location.href;
		shareField.value = new URL(location.href).searchParams.has(
			`dp:${namespace}`,
		)
			? location.href
			: '';
	}
}
updateStatus();
const statusInterval = setInterval(updateStatus, 250);
if (new URL(location.href).searchParams.has(`dp:${namespace}`))
	shareField.value = location.href;

// The canvas reads the bound objects directly: restored values render without
// a second applyAll() pass. Readonly monitor traffic also exercises persistence.
const canvas = $<HTMLCanvasElement>('preview');
const ctx = canvas.getContext('2d');
const resizeCanvas = (): void => {
	const dpr = Math.min(devicePixelRatio || 1, 2);
	canvas.width = Math.round(canvas.clientWidth * dpr);
	canvas.height = Math.round(canvas.clientHeight * dpr);
	ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
};
const canvasObserver = new ResizeObserver(resizeCanvas);
canvasObserver.observe(canvas);
resizeCanvas();
let phase = 0;
let frames = 0;
let lastFps = performance.now();
let previousFrame = lastFps;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let animation = 0;
const wave = (n: number): number =>
	PARAMS.wave === 'square'
		? Math.sign(Math.sin(n))
		: PARAMS.wave === 'triangle'
			? (2 / Math.PI) * Math.asin(Math.sin(n))
			: Math.sin(n);
function draw(now: number): void {
	if (!ctx) return;
	const width = canvas.clientWidth,
		height = canvas.clientHeight;
	const elapsed = Math.min((now - previousFrame) / 1000, 0.1);
	previousFrame = now;
	if (!reducedMotion.matches) phase += elapsed * 1.2 * PARAMS.speed;
	ctx.fillStyle = PARAMS.background;
	ctx.fillRect(0, 0, width, height);
	ctx.strokeStyle = '#ffffff08';
	ctx.lineWidth = 1;
	for (let x = 24; x < width; x += 40) {
		ctx.beginPath();
		ctx.moveTo(x, 48);
		ctx.lineTo(x, height - 40);
		ctx.stroke();
	}
	for (let y = 55; y < height - 35; y += 40) {
		ctx.beginPath();
		ctx.moveTo(0, y);
		ctx.lineTo(width, y);
		ctx.stroke();
	}
	for (let layer = 1; layer >= 0; layer--) {
		ctx.strokeStyle = layer ? secondaryParams.accent : PARAMS.foreground;
		ctx.lineWidth = layer ? 1 : PARAMS.thickness;
		ctx.globalAlpha = layer ? 0.6 : 1;
		ctx.shadowColor = PARAMS.foreground;
		ctx.shadowBlur = !layer && PARAMS.glow ? 14 : 0;
		ctx.beginPath();
		for (let x = 0; x <= width; x += 2) {
			const p =
				(x / Math.max(width, 1)) * Math.PI * 2 * PARAMS.detail +
				phase +
				PARAMS.seed * 0.1;
			const y =
				height / 2 +
				wave(p + (layer ? secondaryParams.offset + 1.2 : 0)) *
					PARAMS.amplitude *
					(layer ? secondaryParams.gain : 1);
			if (x === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		}
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
	ctx.shadowBlur = 0;
	MON.signal = Math.sin(phase * 2);
	MON.running = !reducedMotion.matches;
	frames++;
	if (now - lastFps >= 500) {
		MON.fps = Math.round((frames * 1000) / (now - lastFps));
		frames = 0;
		lastFps = now;
		MON.log = `${MON.fps} fps\n${PARAMS.wave} · ${PARAMS.speed.toFixed(2)}×`;
		$('signal-readout').textContent =
			`${PARAMS.wave} · ${PARAMS.speed.toFixed(2)}× · ${PARAMS.amplitude}px`;
		$('scene-label').textContent = PARAMS.label;
	}
	animation = requestAnimationFrame(draw);
}
animation = requestAnimationFrame(draw);
// Explicit demo inspection surface; application behavior uses public APIs above.
Object.assign(window, {
	driftpane: panel,
	driftpaneDemo: {
		pane,
		panel,
		params: PARAMS,
		tabs,
		secondaryPane,
		independent,
		secondaryParams,
	},
});
window.addEventListener('pagehide', (event) => {
	if (event.persisted) return;
	cancelAnimationFrame(animation);
	clearInterval(statusInterval);
	canvasObserver.disconnect();
	themeObserver.disconnect();
	// Persistence's pagehide listener runs first and flushes pending edits.
	panel.dispose();
	independent.dispose();
	pane.dispose();
	secondaryPane.dispose();
});
