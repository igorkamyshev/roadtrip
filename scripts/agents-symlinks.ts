// Every AGENTS.md must have a sibling CLAUDE.md that is a symlink to it.
//
//   node scripts/agents-symlinks.ts           create missing symlinks
//   node scripts/agents-symlinks.ts --stage   same, then `git add` them (pre-commit)
//   node scripts/agents-symlinks.ts --check   only report problems, exit 1 if any (CI)

import { execFileSync } from 'node:child_process';
import fs, { type Stats } from 'node:fs';
import path from 'node:path';

const TARGET = 'AGENTS.md';
const LINK = 'CLAUDE.md';

const check = process.argv.includes('--check');
const stage = process.argv.includes('--stage');

const root = git('rev-parse', '--show-toplevel').trim();
process.chdir(root);

// Tracked and untracked-but-not-ignored files, so node_modules is skipped.
const agentsFiles = git('ls-files', '--cached', '--others', '--exclude-standard')
	.split('\n')
	.filter((file) => path.basename(file) === TARGET);

const problems: string[] = [];
const created: string[] = [];

for (const agentsFile of agentsFiles) {
	const problem = linkAgentsFile(agentsFile);
	if (problem !== undefined) {
		problems.push(problem);
	}
}

if (stage && created.length > 0) {
	git('add', '--', ...created);
}

if (problems.length > 0) {
	for (const problem of problems) {
		console.error(`agents-symlinks: ${problem}`);
	}
	if (check) {
		console.error('Run `node scripts/agents-symlinks.ts` to fix.');
	}
	process.exit(1);
}

/**
 * Makes the CLAUDE.md beside `agentsFile` a symlink to it (with --check, only
 * looks). Returns the problem it did not fix, if any.
 */
function linkAgentsFile(agentsFile: string): string | undefined {
	if (!fs.existsSync(agentsFile)) {
		return undefined; // deleted in the working tree
	}

	const link = path.join(path.dirname(agentsFile), LINK);
	const stat = lstatOrNull(link);

	if (stat !== null && !stat.isSymbolicLink()) {
		return `${link} is a regular file; merge it into ${agentsFile} and delete it`;
	}

	const linkTarget = stat === null ? null : fs.readlinkSync(link);
	if (linkTarget === TARGET) {
		return undefined;
	}

	if (check) {
		return linkTarget === null
			? `${link} is missing (should be a symlink to ${TARGET})`
			: `${link} points to ${linkTarget}, expected ${TARGET}`;
	}

	if (linkTarget !== null) {
		fs.unlinkSync(link);
	}
	fs.symlinkSync(TARGET, link);
	created.push(link);
	console.log(`agents-symlinks: linked ${link} -> ${TARGET}`);
	return undefined;
}

function git(...args: string[]): string {
	return execFileSync('git', args, { encoding: 'utf-8' });
}

function lstatOrNull(file: string): Stats | null {
	try {
		return fs.lstatSync(file);
	} catch {
		return null;
	}
}
