// Mirrors the monorepo house style (prettier.config.js at the repo root) for the
// standalone driftpane package. Tabs + single quotes + no bracket spacing +
// trailing commas everywhere, so emitted code matches the existing src/ style.
module.exports = {
	arrowParens: 'always',
	bracketSpacing: false,
	singleQuote: true,
	trailingComma: 'all',
	useTabs: true,
};
