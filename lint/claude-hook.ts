// Claude Code hook (.claude/settings.json) that lints what an agent changed once it
// moves on from changing it: Oxlint checks the source files and the agent reads the
// errors. It only reports: fixing and formatting happen at pre-commit, so a file
// never changes under the agent between two edits (ADR 0002).
//
// An edit (PostToolUse of Edit, Write, MultiEdit) is only noted: the next edit may
// finish what this one started, as when one adds a call and the next the function
// it calls. The agent's noted files are linted at its next shell command
// (PostToolUse of Bash) and when it stops (Stop, SubagentStop). Each agent has its
// own note (`claude-hook-edited-<agent>` in the git dir), so a subagent hears only
// of its own edits. A stop is blocked once in a row: an agent this hook kept going
// (`stop_hook_active`) may stop, and its note waits for its next shell command.
//
// A shell command names no file, so after one the hook also checks the source files
// changed or added since its previous run in that checkout: their modification time
// is later than a stamp the hook touches on every run (`claude-hook-stamp` in the
// git dir). The first run in a checkout only sets the stamp.
//
// Oxlint runs from the root of the checkout that holds the file, so an agent in
// a git worktree inside this one is checked with its own config and install. A
// checkout without that install (a cloud session starts without node_modules)
// is reported too, so edits never go unchecked unnoticed.
//
// Exit 2 hands stderr to the agent; exit 0 says nothing.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative } from 'node:path';

const SOURCE = /\.(?:ts|js|mjs|cjs)$/u;

/** What the hook reads of an event: which tool (none at a stop), the file an edit names, the agent's directory and id, and whether this hook kept it from stopping. */
interface HookEvent {
	tool: string | undefined;
	file: string | undefined;
	cwd: string;
	agent: string;
	stopHookActive: boolean;
}

/** `value[key]` when `value` is an object and that field a string. */
function stringField(value: unknown, key: string): string | undefined {
	if (typeof value !== 'object' || value === null || !(key in value)) {
		return undefined;
	}
	const field: unknown = Reflect.get(value, key);
	return typeof field === 'string' ? field : undefined;
}

function hookEvent(input: string): HookEvent {
	const event: unknown = JSON.parse(input);
	const toolInput: unknown = typeof event === 'object' && event !== null && 'tool_input' in event ? event.tool_input : undefined;
	return {
		tool: stringField(event, 'tool_name'),
		file: stringField(toolInput, 'file_path'),
		cwd: stringField(event, 'cwd') ?? process.cwd(),
		// Only a subagent's events carry an id; it names a file, so it keeps to safe characters.
		agent: (stringField(event, 'agent_id') ?? 'main').replaceAll(/[^\w-]/gu, '_'),
		stopHookActive: typeof event === 'object' && event !== null && Reflect.get(event, 'stop_hook_active') === true,
	};
}

function git(directory: string, args: string[]): string | undefined {
	const run = spawnSync('git', ['-C', directory, ...args], { encoding: 'utf8' });
	return run.status === 0 ? run.stdout : undefined;
}

/** The top of the git checkout (or worktree) that holds `directory`, or undefined outside one. */
function checkoutRoot(directory: string): string | undefined {
	return git(directory, ['rev-parse', '--show-toplevel'])?.trim();
}

/** `name` in the git dir of the checkout at `root`. */
function gitPath(root: string, name: string): string | undefined {
	const path = git(root, ['rev-parse', '--git-path', name])?.trim();
	if (path === undefined) {
		return undefined;
	}
	return isAbsolute(path) ? path : join(root, path);
}

/** Touches the checkout's stamp and returns when it was touched before, or undefined on the first run. */
function touchStamp(root: string): number | undefined {
	const stamp = gitPath(root, 'claude-hook-stamp');
	if (stamp === undefined) {
		return undefined;
	}
	const before = existsSync(stamp) ? statSync(stamp).mtimeMs : undefined;
	writeFileSync(stamp, '');
	return before;
}

/** Notes a source `file` that `agent` edited, to lint once it moves on. */
function noteEdit(root: string, agent: string, file: string): void {
	const note = gitPath(root, `claude-hook-edited-${agent}`);
	if (note !== undefined && SOURCE.test(file)) {
		appendFileSync(note, `${file}\n`);
	}
}

/** The files `agent` edited since its last lint that are still there; the note is cleared. */
function takeEdits(root: string, agent: string): string[] {
	const note = gitPath(root, `claude-hook-edited-${agent}`);
	if (note === undefined || !existsSync(note)) {
		return [];
	}
	const files = readFileSync(note, 'utf8')
		.split('\n')
		.filter((file) => file !== '' && existsSync(file));
	rmSync(note);
	return files;
}

/** The checkout's source files changed or added (not ignored) after `since`. */
function changedSince(root: string, since: number): string[] {
	const listed = git(root, ['ls-files', '--modified', '--others', '--exclude-standard', '-z']) ?? '';
	return [...new Set(listed.split('\0'))]
		.filter((file) => SOURCE.test(file))
		.map((file) => join(root, file))
		.filter((file) => existsSync(file) && statSync(file).mtimeMs > since);
}

/** What the agent is told about `files` in the checkout at `root`: Oxlint's report, or that Oxlint is not installed; undefined when there is nothing to say. */
function hookMessage(root: string, files: string[]): string | undefined {
	if (files.length === 0) {
		return undefined;
	}
	const oxlint = join(root, 'node_modules/.bin/oxlint');
	if (!existsSync(oxlint)) {
		return `Oxlint is not installed in ${root}: run \`pnpm install\` there, so your edits are linted.\n`;
	}
	const lint = spawnSync(
		oxlint,
		files.map((file) => relative(root, file)),
		{ cwd: root, encoding: 'utf8' },
	);
	// A file the config ignores (generated code) leaves Oxlint with nothing to lint.
	if (lint.status === 0 || lint.stdout.includes('No files found to lint')) {
		return undefined;
	}
	return `${lint.stdout}${lint.stderr}\nFix these before moving on; to disable a rule on one line, give the reason (AGENTS.md, Checks).\n`;
}

/** The checkout and the source files to lint after `event`: none after an edit, which is only noted. */
function filesToCheck(event: HookEvent): { root: string; files: string[] } | undefined {
	const root = checkoutRoot(event.file === undefined ? event.cwd : dirname(event.file));
	// Not in a checkout: nothing to check.
	if (root === undefined) {
		return undefined;
	}
	// Every run touches the stamp, so a file an edit wrote reaches the lint by the note alone, the agent's own.
	const since = touchStamp(root);
	if (event.file !== undefined) {
		noteEdit(root, event.agent, event.file);
		return { root, files: [] };
	}
	const changed = event.tool === 'Bash' && since !== undefined ? changedSince(root, since) : [];
	return { root, files: [...new Set([...takeEdits(root, event.agent), ...changed])] };
}

const event = hookEvent(readFileSync(0, 'utf8'));
const check = event.stopHookActive ? undefined : filesToCheck(event);
const message = check === undefined ? undefined : hookMessage(check.root, check.files);
if (message !== undefined) {
	process.stderr.write(message);
	process.exit(2);
}
