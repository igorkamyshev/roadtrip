import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const HOOK = fileURLToPath(new URL('claude-hook.ts', import.meta.url));
const REPO_MODULES = fileURLToPath(new URL('../node_modules', import.meta.url));

/** A file Oxlint refuses under the checkout's config below. */
const BAD = 'debugger;\n';

let checkout: string;

beforeEach(() => {
	// A git checkout with this repo's Oxlint and a config of one rule.
	checkout = mkdtempSync(join(tmpdir(), 'claude-hook-'));
	spawnSync('git', ['init', '-q'], { cwd: checkout });
	symlinkSync(REPO_MODULES, join(checkout, 'node_modules'));
	writeFileSync(join(checkout, '.gitignore'), 'node_modules\n');
	writeFileSync(join(checkout, '.oxlintrc.json'), JSON.stringify({ rules: { 'no-debugger': 'error' } }));
	mkdirSync(join(checkout, 'src'));
});

afterEach(() => {
	rmSync(checkout, { recursive: true, force: true });
});

/** Runs the hook as Claude Code does after a tool call; its exit code and what it tells the agent. */
function hook(event: object): { status: number | null; told: string } {
	const run = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ cwd: checkout, ...event }), encoding: 'utf8' });
	return { status: run.status, told: run.stderr };
}

const shellCommand = { tool_name: 'Bash', tool_input: { command: '…' } };
const stop = { hook_event_name: 'Stop', stop_hook_active: false };

/** An agent's edit that leaves `src/a.ts` holding `text`; a subagent's when `agent_id` is given. */
function edit(text: string, agentId?: string): object {
	const file = join(checkout, 'src/a.ts');
	writeFileSync(file, text);
	return { tool_name: 'Edit', tool_input: { file_path: file }, ...(agentId !== undefined && { agent_id: agentId }) };
}

describe('the lint hook', () => {
	it('says nothing after an edit, and reports its errors at the next shell command', () => {
		expect(hook(edit(BAD))).toEqual({ status: 0, told: '' });
		const { status, told } = hook(shellCommand);
		expect(status).toBe(2);
		expect(told).toContain('no-debugger');
	});

	it('reports the errors of an edited component (.tsx) too', () => {
		const file = join(checkout, 'src/card.tsx');
		writeFileSync(file, BAD);
		hook({ tool_name: 'Write', tool_input: { file_path: file } });
		const { status, told } = hook(shellCommand);
		expect(status).toBe(2);
		expect(told).toContain('src/card.tsx');
	});

	it('lints a change made by two edits once both are done', () => {
		const first = hook(edit(BAD)); // say, a call to a function the next edit adds
		hook(edit('export {};\n'));
		expect([first, hook(shellCommand)]).toEqual([
			{ status: 0, told: '' },
			{ status: 0, told: '' },
		]);
	});

	it('reports an edit’s errors when the agent stops, once in a row', () => {
		hook(edit(BAD));
		expect(hook(stop).status).toBe(2);
		hook(edit(BAD));
		expect(hook({ ...stop, stop_hook_active: true })).toEqual({ status: 0, told: '' });
		expect(hook(shellCommand).status).toBe(2); // the edit waited for the next shell command
	});

	it('tells a subagent only of its own edits', () => {
		hook(edit(BAD));
		expect(hook({ hook_event_name: 'SubagentStop', stop_hook_active: false, agent_id: 'a1' })).toEqual({ status: 0, told: '' });
		expect(hook(stop).status).toBe(2);
	});

	it('reports the errors of a file a shell command wrote', () => {
		hook(shellCommand);
		writeFileSync(join(checkout, 'src/a.ts'), BAD);
		const { status, told } = hook(shellCommand);
		expect(status).toBe(2);
		expect(told).toContain('src/a.ts');
	});

	it('says nothing after a shell command that changed no source file', () => {
		hook(shellCommand);
		writeFileSync(join(checkout, 'src/a.ts'), BAD);
		hook(shellCommand);
		expect(hook(shellCommand)).toEqual({ status: 0, told: '' });
	});
});
