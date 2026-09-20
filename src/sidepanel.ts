import type {DriftpaneSidepanelOptions} from './types.js';

// Contributions are shared so disposing one panel does not undo another panel's push.
const pushes = new WeakMap<
	HTMLElement,
	{
		left: string;
		right: string;
		leftPriority: string;
		rightPriority: string;
		baseLeft: string;
		baseRight: string;
		panels: Map<SidepanelController, {side: 'left' | 'right'; width: number}>;
	}
>();

const pushAnimations = new WeakMap<HTMLElement, Animation>();

let nextPanelId = 0;

/** Non-modal, viewport-docked presentation. Floating layout is restored on dispose. */
export class SidepanelController {
	public readonly element: HTMLElement;
	private readonly marker: Comment;
	private readonly closeButton: HTMLButtonElement;
	public readonly trigger: HTMLButtonElement | null;
	private hoverTimer: ReturnType<typeof setTimeout> | undefined;
	private pointerInside = false;
	private readonly target: HTMLElement;
	private readonly win: Window | null;
	private readonly side: 'left' | 'right';
	private readonly mode: 'hover' | 'push';
	private width: number;
	private opened = false;
	private disposed = false;
	private returnFocus: HTMLElement | null = null;

	constructor(
		private readonly pane: HTMLElement,
		options: DriftpaneSidepanelOptions = {},
	) {
		const doc = pane.ownerDocument;
		this.win = doc.defaultView;
		this.side = options.side === 'left' ? 'left' : 'right';
		this.mode = options.mode === 'push' ? 'push' : 'hover';
		this.width = this.validWidth(options.width ?? 320);
		this.target = options.pushTarget ?? doc.body;
		this.marker = doc.createComment('driftpane-sidepanel');
		pane.before(this.marker);
		this.element = doc.createElement('aside');
		this.element.className = 'driftpane-sidepanel';
		this.element.id = `driftpane-sidepanel-${++nextPanelId}`;
		this.element.dataset.side = this.side;
		const label =
			options.label ??
			pane.querySelector('.tp-rotv_t')?.textContent ??
			'Settings';
		this.element.setAttribute('aria-label', label);
		const header = doc.createElement('div');
		header.className = 'driftpane-sidepanel-header';
		const title = doc.createElement('span');
		title.textContent = label;
		this.closeButton = doc.createElement('button');
		this.closeButton.type = 'button';
		this.closeButton.className = 'driftpane-sidepanel-close';
		this.closeButton.textContent = '×';
		this.closeButton.setAttribute('aria-label', 'Close panel');
		this.closeButton.addEventListener('click', this.close);
		header.append(title, this.closeButton);
		this.element.append(header, pane);
		this.trigger = this.mode === 'hover' ? doc.createElement('button') : null;
		if (this.trigger) {
			this.trigger.type = 'button';
			this.trigger.className = 'driftpane-sidepanel-trigger';
			this.trigger.dataset.side = this.side;
			this.trigger.textContent = label;
			this.trigger.setAttribute('aria-label', `Open ${label}`);
			this.trigger.setAttribute('aria-controls', this.element.id);
			this.trigger.addEventListener('pointerenter', this.onPointerEnter);
			this.trigger.addEventListener('pointerleave', this.onPointerLeave);
			this.trigger.addEventListener('click', this.onTriggerClick);
			doc.body.append(this.trigger);
		}
		this.element.addEventListener('pointerenter', this.onPointerEnter);
		this.element.addEventListener('pointerleave', this.onPointerLeave);
		this.element.addEventListener('focusout', this.scheduleClose);
		doc.body.append(this.element);
		this.element.addEventListener('keydown', this.onKeyDown);
		this.element.addEventListener('transitionend', this.layout);
		this.win?.addEventListener('resize', this.layout);
		this.setOpen(options.open ?? this.mode === 'push', false);
	}

	public get isOpen(): boolean {
		return this.opened;
	}
	public open = (): void => {
		this.setOpen(true);
	};
	public close = (): void => {
		this.setOpen(false);
	};
	public toggle(): void {
		this.setOpen(!this.opened);
	}
	public setWidth(width: number): void {
		if (!Number.isFinite(width) || width <= 0 || this.disposed) return;
		this.width = this.validWidth(width);
		this.layout();
	}

	private onTriggerClick = (): void => {
		this.open();
	};
	private onPointerEnter = (event: PointerEvent): void => {
		if (this.mode !== 'hover' || event.pointerType === 'touch') return;
		this.pointerInside = true;
		clearTimeout(this.hoverTimer);
		this.setOpen(true, false);
	};
	private onPointerLeave = (event: PointerEvent): void => {
		if (
			event.relatedTarget instanceof Node &&
			this.element.contains(event.relatedTarget)
		)
			return;
		this.pointerInside = false;
		this.scheduleClose();
	};
	private scheduleClose = (): void => {
		if (this.mode !== 'hover') return;
		clearTimeout(this.hoverTimer);
		this.hoverTimer = setTimeout(() => {
			const focused = this.pane.ownerDocument.activeElement;
			if (
				!this.pointerInside &&
				!(
					focused &&
					this.element.contains(focused) &&
					focused.matches(':focus-visible')
				)
			) {
				this.close();
			}
		}, 180);
	};

	private validWidth(width: number): number {
		return Number.isFinite(width) && width > 0 ? Math.max(200, width) : 320;
	}
	private setOpen(open: boolean, focus = true): void {
		if (this.disposed) return;
		const wasOpen = this.opened;
		// Capture before hiding the edge tab: browsers blur a hidden opener immediately.
		if (open && !wasOpen) {
			this.returnFocus = this.pane.ownerDocument
				.activeElement as HTMLElement | null;
		}
		this.opened = open;
		this.trigger?.setAttribute('aria-expanded', String(open));
		if (this.trigger) this.trigger.hidden = open;
		this.element.dataset.open = String(open);
		this.element.toggleAttribute('inert', !open);
		this.element.setAttribute('aria-hidden', String(!open));
		if (open && !wasOpen) {
			if (focus) this.closeButton.focus({preventScroll: true});
		} else if (
			!open &&
			wasOpen &&
			this.element.contains(this.pane.ownerDocument.activeElement)
		) {
			(this.returnFocus?.isConnected ? this.returnFocus : this.trigger)?.focus({
				preventScroll: true,
			});
			if (this.element.contains(this.pane.ownerDocument.activeElement)) {
				(this.pane.ownerDocument.activeElement as HTMLElement | null)?.blur();
			}
		}
		this.layout();
	}
	private onKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape' && !event.defaultPrevented) {
			event.preventDefault();
			this.close();
		}
	};
	private layout = (): void => {
		if (this.disposed) return;
		const viewport = this.win?.innerWidth ?? this.width;
		const width = Math.min(this.width, viewport);
		this.element.style.width = `${width}px`;
		// Narrow screens use overlay to avoid squeezing the page into an unusable strip.
		const push = this.mode === 'push' && viewport > 600 && this.opened;
		this.element.dataset.mode =
			this.mode === 'push' && viewport > 600
				? 'push'
				: this.mode === 'hover'
					? 'hover'
					: 'overlay';
		this.updatePush(push ? width : 0);
		this.pane.dispatchEvent(new Event('driftpane-layout'));
	};
	private updatePush(width: number): void {
		const contribution = pushes.get(this.target)?.panels.get(this);
		if ((contribution?.width ?? 0) === width) return;
		const before = this.win?.getComputedStyle(this.target);
		const from = {
			marginLeft: before?.marginLeft ?? '0px',
			marginRight: before?.marginRight ?? '0px',
		};
		// Read the current visual position before cancelling an interrupted transition.
		pushAnimations.get(this.target)?.cancel();
		pushAnimations.delete(this.target);
		this.writePush(width);
		if (
			!this.target.animate ||
			this.win?.matchMedia?.('(prefers-reduced-motion: reduce)').matches
		)
			return;
		const after = this.win?.getComputedStyle(this.target);
		const to = {
			marginLeft: after?.marginLeft ?? '0px',
			marginRight: after?.marginRight ?? '0px',
		};
		if (
			from.marginLeft === to.marginLeft &&
			from.marginRight === to.marginRight
		)
			return;
		// Animate layout itself so content and canvases resize with the dock, without
		// replacing the consumer's inline CSS transitions or leaving cleanup styles.
		const animation = this.target.animate([from, to], {
			duration: 180,
			easing: 'ease',
		});
		pushAnimations.set(this.target, animation);
		void animation.finished
			.catch(() => {})
			.then(() => {
				if (pushAnimations.get(this.target) === animation)
					pushAnimations.delete(this.target);
			});
	}
	private writePush(width: number): void {
		let state = pushes.get(this.target);
		if (!state && width > 0) {
			const computed = this.win?.getComputedStyle(this.target);
			state = {
				left: this.target.style.marginLeft,
				right: this.target.style.marginRight,
				leftPriority: this.target.style.getPropertyPriority('margin-left'),
				rightPriority: this.target.style.getPropertyPriority('margin-right'),
				baseLeft: computed?.marginLeft || '0px',
				baseRight: computed?.marginRight || '0px',
				panels: new Map(),
			};
			pushes.set(this.target, state);
		}
		if (!state) return;
		if (width > 0) state.panels.set(this, {side: this.side, width});
		else state.panels.delete(this);
		if (!state.panels.size) {
			this.target.style.setProperty(
				'margin-left',
				state.left,
				state.leftPriority,
			);
			this.target.style.setProperty(
				'margin-right',
				state.right,
				state.rightPriority,
			);
			pushes.delete(this.target);
			return;
		}
		let left = 0,
			right = 0;
		for (const panel of state.panels.values()) {
			if (panel.side === 'left') left = Math.max(left, panel.width);
			else right = Math.max(right, panel.width);
		}
		this.target.style.setProperty(
			'margin-left',
			`calc(${state.baseLeft} + ${left}px)`,
			state.leftPriority,
		);
		this.target.style.setProperty(
			'margin-right',
			`calc(${state.baseRight} + ${right}px)`,
			state.rightPriority,
		);
	}
	public dispose(): void {
		if (this.disposed) return;
		this.close();
		this.disposed = true;
		clearTimeout(this.hoverTimer);
		this.element.removeEventListener('pointerenter', this.onPointerEnter);
		this.element.removeEventListener('pointerleave', this.onPointerLeave);
		this.element.removeEventListener('focusout', this.scheduleClose);
		this.trigger?.removeEventListener('pointerenter', this.onPointerEnter);
		this.trigger?.removeEventListener('pointerleave', this.onPointerLeave);
		this.trigger?.removeEventListener('click', this.onTriggerClick);
		this.trigger?.remove();
		this.win?.removeEventListener('resize', this.layout);
		this.element.removeEventListener('keydown', this.onKeyDown);
		this.element.removeEventListener('transitionend', this.layout);
		this.closeButton.removeEventListener('click', this.close);
		if (this.marker.parentNode) this.marker.replaceWith(this.pane);
		else this.element.before(this.pane);
		this.element.remove();
	}
}
