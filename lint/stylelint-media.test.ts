import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

/** The rules the root's stylelint.config.mjs finds broken in `css`. */
async function findings(css: string): Promise<string[]> {
	const { results } = await stylelint.lint({ code: css, configFile: 'stylelint.config.mjs' });
	return results.flatMap((result) => result.warnings.map((warning) => warning.rule));
}

describe('the media queries of the CSS', () => {
	it('pass by their names in web/src/media.json', async () => {
		expect(await findings('@media (--wide) {\n\ta {\n\t\tcolor: #000;\n\t}\n}\n')).toEqual([]);
		expect(await findings('@media (--wide) and (--mouse) {\n\ta {\n\t\tcolor: #000;\n\t}\n}\n')).toEqual([]);
	});

	it('fail written out, a size or a preference alike', async () => {
		expect(await findings('@media (min-width: 720px) {\n\ta {\n\t\tcolor: #000;\n\t}\n}\n')).toContain('media-feature-name-allowed-list');
		expect(await findings('@media (prefers-color-scheme: dark) {\n\ta {\n\t\tcolor: #000;\n\t}\n}\n')).toContain(
			'media-feature-name-allowed-list',
		);
		expect(await findings('@media (--wide) and (hover: hover) {\n\ta {\n\t\tcolor: #000;\n\t}\n}\n')).toContain(
			'media-feature-name-allowed-list',
		);
	});
});
