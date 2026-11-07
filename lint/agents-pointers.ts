// Every package's AGENTS.md has a line in the root AGENTS.md, and every `<folder>/AGENTS.md` the
// root names exists. An agent reaches a package's AGENTS.md through that line: a harness may load
// it only once the agent opens a file there, which a search with `cat` or `grep` never does.
//
//   node lint/agents-pointers.ts   exit 1 and print the missing and the stale lines
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const ROOT = 'AGENTS.md';
/** A path in backticks ending in `/AGENTS.md`: how the root names a package's AGENTS.md. */
const NAMED = /`([^`\s]+\/AGENTS\.md)`/gu;

/** What is wrong with the root's lines (`rootText`) for `agentsFiles`, every AGENTS.md of the repo by its path. */
export function pointerProblems(rootText: string, agentsFiles: readonly string[]): string[] {
	const named = new Set([...rootText.matchAll(NAMED)].map((match) => match[1]));
	const packages = agentsFiles.filter((file) => file !== ROOT);
	return [
		...packages
			.filter((file) => !named.has(file))
			.map((file) => `${ROOT} has no line for ${file}: add one under «Packages» saying what it covers`),
		...[...named].filter((file) => !packages.includes(file)).map((file) => `${ROOT} names ${file}, which does not exist`),
	];
}

if (process.argv[1].endsWith('agents-pointers.ts')) {
	// Tracked and untracked-but-not-ignored files, so node_modules is skipped (as scripts/agents-symlinks.ts does).
	const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' })
		.split('\n')
		.filter((file) => basename(file) === ROOT);
	const problems = pointerProblems(readFileSync(ROOT, 'utf8'), files);
	for (const problem of problems) {
		process.stderr.write(`agents-pointers: ${problem}\n`);
	}
	if (problems.length > 0) {
		process.exit(1);
	}
}
