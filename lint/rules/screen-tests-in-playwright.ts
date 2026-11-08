import { basename } from 'node:path';
import type { Rule } from './rule.ts';

const TEST = /\.(?:test|spec)\.tsx?$/u;

/** The screen is tested at its seam, the built client in Playwright, not by unit tests of its modules (CODING_STANDARDS.md, Tests). */
export const screenTestsInPlaywright: Rule = {
	meta: { type: 'problem', docs: { description: 'Test the screen in web/e2e with Playwright, not beside its modules.' } },
	create(context) {
		const file = context.physicalFilename;
		if (!TEST.test(file)) {
			return {};
		}
		return {
			Program(node) {
				context.report({
					node,
					message: `${basename(file)}: the screen is tested through the built client in Playwright (web/e2e, \`pnpm e2e\`), not by a unit test in web/src.`,
				});
			},
		};
	},
};
