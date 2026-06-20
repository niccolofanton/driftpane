// MINIMAL ambient declaration of the 'tweakpane' module for the type-check of
// the demo ONLY (the runtime uses the ESM 4.0.5 build resolved via import-map).
//
// Covers the public members used by demo/main.ts. In production these types
// would come from the workspace package (dist/types/index.d.ts); here it is not
// installed, so we provide a compatible and minimal interface.

declare module 'tweakpane' {
	export interface BindingApi {
		on(event: 'change', handler: (ev: {value: unknown}) => void): BindingApi;
	}

	export interface ButtonApi {
		on(event: 'click', handler: () => void): ButtonApi;
	}

	export interface BladeApi {
		on(event: 'change', handler: (ev: {value: unknown}) => void): BladeApi;
	}

	/** Members common to Pane, FolderApi and TabPageApi (blade containers). */
	export interface ContainerApi {
		addBinding(
			object: object,
			key: string,
			params?: Record<string, unknown>,
		): BindingApi;
		addFolder(params: {title: string; expanded?: boolean}): FolderApi;
		addButton(params: {title: string; label?: string}): ButtonApi;
		addBlade(params: Record<string, unknown>): BladeApi;
		addTab(params: {pages: {title: string}[]}): TabApi;
	}

	export interface FolderApi extends ContainerApi {
		expanded: boolean;
	}

	export interface TabPageApi extends ContainerApi {
		readonly selected: boolean;
	}

	export interface TabApi {
		readonly pages: TabPageApi[];
	}

	export interface PaneConfig {
		title?: string;
		container?: HTMLElement;
		expanded?: boolean;
	}

	export class Pane implements ContainerApi {
		constructor(config?: PaneConfig);
		readonly element: HTMLElement;
		addBinding(
			object: object,
			key: string,
			params?: Record<string, unknown>,
		): BindingApi;
		addFolder(params: {title: string; expanded?: boolean}): FolderApi;
		addButton(params: {title: string; label?: string}): ButtonApi;
		addBlade(params: Record<string, unknown>): BladeApi;
		addTab(params: {pages: {title: string}[]}): TabApi;
		exportState(): Record<string, unknown>;
		importState(state: Record<string, unknown>): boolean;
		refresh(): void;
		on(event: 'change' | 'fold', handler: (ev: unknown) => void): unknown;
	}
}
