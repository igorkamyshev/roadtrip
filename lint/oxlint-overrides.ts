// Every `files` pattern of an override in .oxlintrc.json matches a file (ADR 0002). An override
// left behind by a moved or deleted file turns rules off for nothing, and nothing else notices.
//
//   node lint/oxlint-overrides.ts   exit 1 and print the patterns that match no file
import { globSync, readFileSync } from 'node:fs';

/** The `files` patterns of the overrides in `configText` (JSON with comments) for which `matches` finds no file. */
export function unmatchedOverrides(configText: string, matches: (pattern: string) => boolean): string[] {
	// Drop `//` comments, keeping strings (a URL's `//` included) as they are.
	const json = configText.replaceAll(/("(?:\\.|[^"\\])*")|\/\/[^\n]*/gu, (_, string: string | undefined) => string ?? '');
	const config: unknown = JSON.parse(json);
	const overrides = isRecord(config) ? listOf(config.overrides) : [];
	const patterns = overrides.flatMap((override) => (isRecord(override) ? listOf(override.files) : []));
	return patterns.filter((pattern): pattern is string => typeof pattern === 'string' && !matches(pattern));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function listOf(value: unknown): unknown[] {
	return Array.isArray(value) ? value.map((item: unknown) => item) : [];
}

function hasFile(pattern: string): boolean {
	return globSync(pattern, { exclude: (path) => path.includes('node_modules') }).length > 0;
}

if (process.argv[1].endsWith('oxlint-overrides.ts')) {
	const unmatched = unmatchedOverrides(readFileSync('.oxlintrc.json', 'utf8'), hasFile);
	for (const pattern of unmatched) {
		console.error(`.oxlintrc.json: the override pattern ${pattern} matches no file. Remove it, or point it at where the file went.`);
	}
	process.exitCode = unmatched.length > 0 ? 1 : 0;
}
