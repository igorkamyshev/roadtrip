import { describe, expect, it } from 'vitest';
import { pointerProblems } from './agents-pointers.ts';

const ROOT = `# roadtrip

## Packages

Read a package's \`AGENTS.md\` before working in it:

- \`web/AGENTS.md\`: the web app.
`;

describe('pointers to the packages’ AGENTS.md', () => {
	it('are fine when the root names every package’s AGENTS.md and nothing else', () => {
		expect(pointerProblems(ROOT, ['AGENTS.md', 'web/AGENTS.md'])).toEqual([]);
	});

	it('miss a package’s AGENTS.md the root does not name', () => {
		expect(pointerProblems(ROOT, ['AGENTS.md', 'web/AGENTS.md', 'api/AGENTS.md'])).toEqual([
			'AGENTS.md has no line for api/AGENTS.md: add one under «Packages» saying what it covers',
		]);
	});

	it('go stale when the root names an AGENTS.md that is gone', () => {
		expect(pointerProblems(ROOT, ['AGENTS.md'])).toEqual(['AGENTS.md names web/AGENTS.md, which does not exist']);
	});

	it('count only a path in backticks: a word in a sentence is no pointer', () => {
		const root = 'Read web/AGENTS.md before working there.';
		expect(pointerProblems(root, ['AGENTS.md', 'web/AGENTS.md'])).toEqual([
			'AGENTS.md has no line for web/AGENTS.md: add one under «Packages» saying what it covers',
		]);
	});
});
