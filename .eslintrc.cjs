// ESLint config for the standalone `driftpane` package. Self-contained
// (root: true) so it resolves plugins from driftpane/node_modules and does not
// inherit the monorepo root config (which targets older eslint/plugin majors).
// Mirrors the repo's house style: prettier + simple-import-sort + TS recommended.
module.exports = {
	root: true,
	env: {
		browser: true,
		es2021: true,
		node: true,
	},
	parser: '@typescript-eslint/parser',
	parserOptions: {
		ecmaVersion: 2021,
		sourceType: 'module',
	},
	plugins: ['@typescript-eslint', 'prettier', 'simple-import-sort'],
	extends: [
		'eslint:recommended',
		'plugin:@typescript-eslint/eslint-recommended',
		'plugin:@typescript-eslint/recommended',
		'plugin:prettier/recommended',
	],
	rules: {
		camelcase: 'off',
		'no-console': ['warn', {allow: ['warn', 'error', 'info']}],
		'no-unused-vars': 'off',
		'sort-imports': 'off',
		'prettier/prettier': 'error',
		'simple-import-sort/imports': 'error',
		'@typescript-eslint/explicit-function-return-type': 'off',
		'@typescript-eslint/no-empty-function': 'off',
		'@typescript-eslint/no-explicit-any': 'off',
		'@typescript-eslint/explicit-module-boundary-types': 'off',
		'@typescript-eslint/no-unused-vars': [
			'error',
			{argsIgnorePattern: '^_'},
		],
	},
	overrides: [
		{
			files: ['test/**/*.ts'],
			env: {node: true},
			rules: {
				// Tests intentionally probe console output and use loose typing.
				'no-console': 'off',
			},
		},
	],
};
