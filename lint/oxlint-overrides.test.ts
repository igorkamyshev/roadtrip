import { expect, it } from 'vitest';
import { unmatchedOverrides } from './oxlint-overrides.ts';

const config = `{
	// A comment, and a "// string" that is not one.
	"$schema": "https://example.test//schema.json",
	"overrides": [
		{ "files": ["worker/src/gone.ts", "**/*.test.ts"], "rules": {} },
		{ "files": ["data/src/cli/**"], "rules": {} }
	]
}`;

it('names the override patterns that match no file', () => {
	const files = new Set(['**/*.test.ts', 'data/src/cli/**']);
	expect(unmatchedOverrides(config, (pattern) => files.has(pattern))).toEqual(['worker/src/gone.ts']);
});

it('is empty when every pattern matches', () => {
	expect(unmatchedOverrides(config, () => true)).toEqual([]);
});
