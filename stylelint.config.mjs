// Stylelint for the CSS (ADR 0002): stylelint-config-standard, every finding an error, plus what the browsers of
// `browserslist` in web/package.json cannot do (stylelint-no-unsupported-browser-features, caniuse's data). Rules are
// turned off here with the reason beside them, or on one line: `/* stylelint-disable-next-line <rule> -- <why> */`.
export default {
	extends: ['stylelint-config-standard'],
	plugins: ['stylelint-no-unsupported-browser-features'],
	ignoreFiles: ['**/dist/**', '**/test-results/**'],
	// A disable names its rule and says why, and one that disables nothing is itself an error, as Oxlint's.
	reportDescriptionlessDisables: true,
	reportInvalidScopeDisables: true,
	reportNeedlessDisables: true,
	reportUnscopedDisables: true,
	rules: {
		'plugin/no-unsupported-browser-features': [
			true,
			{
				severity: 'error',
				ignore: [
					// caniuse calls any `overflow` partial in Safari 15 for `overflow: clip` and two values in the
					// shorthand; `hidden`, `auto` and `scroll` are everywhere.
					'css-overflow',
					// Desktop Safari has no touch; Safari on iOS has `touch-action`.
					'css-touch-action',
				],
			},
		],
		// Typos the browser drops without a word: a value the property does not take, a custom property never set.
		'declaration-property-value-no-unknown': true,
		'no-unknown-custom-properties': true,
		// The cascade stays readable: no ids, no `!important`, nesting as shallow as the code's (ADR 0002, «Пределы»).
		'selector-max-id': 0,
		'declaration-no-important': true,
		'max-nesting-depth': 3,
		'color-named': 'never',
	},
};
