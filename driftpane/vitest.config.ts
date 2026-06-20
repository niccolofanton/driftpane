import {defineConfig} from 'vitest/config';

export default defineConfig({
	test: {
		// jsdom gives us window/document/localStorage/HTMLElement for the
		// DOM-level controllers (driftpane facade, draggable, preset-menu).
		environment: 'jsdom',
		globals: true,
		include: ['test/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reportsDirectory: 'coverage',
			reporter: ['text', 'lcov', 'html'],
			include: ['src/**/*.ts'],
			// Pure type-only module and the barrel have no runtime branches worth
			// measuring; the rest is covered directly.
			exclude: ['src/types.ts', 'src/index.ts'],
		},
	},
});
