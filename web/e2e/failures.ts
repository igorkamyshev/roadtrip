// A reporter that keeps a run's failures whole in one file (playwright.config.ts: test-results/failures.md), for a
// later command to read: each failed test with its errors, their code and stacks, and the path of the
// `error-context.md` Playwright writes for it (the error again, the page's aria snapshot, the test's source); then the
// errors outside any test, as a preview server that would not start. The console's list says the same, but read
// through `tail` or `grep` it lost them. A run without failures leaves no file: Playwright empties test-results/ as
// a run starts. The console's last line says where the file is.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import type { FullConfig, FullResult, Reporter, TestCase, TestError, TestResult } from '@playwright/test/reporter';

/** What Playwright says when the preview server's port is taken; it suggests reusing that server, which we never do. */
const PORT_TAKEN = /is already used, make sure that nothing is running on the port/u;
const PORT_TAKEN_HINT =
	'The port of this checkout is taken (playwright.config.ts never tests a server it did not start): stop what listens there, an earlier run of this checkout perhaps, or give another port with E2E_PORT.';

export default class FailuresReporter implements Reporter {
	readonly #outputFile: string;
	/** web/, which the tests' locations are relative to, as in the console. */
	#root = process.cwd();
	readonly #failures: string[] = [];
	#hint: string | undefined;

	constructor({ outputFile }: { readonly outputFile: string }) {
		this.#outputFile = outputFile;
	}

	printsToStdio(): boolean {
		return false;
	}

	onConfigure(config: FullConfig): void {
		this.#root = config.configFile === undefined ? process.cwd() : dirname(config.configFile);
	}

	onTestEnd(test: TestCase, result: TestResult): void {
		if (result.status === test.expectedStatus || result.status === 'skipped') {
			return;
		}
		const { file, line, column } = test.location;
		const repeat = test.repeatEachIndex > 0 ? `, repeat ${test.repeatEachIndex}` : '';
		const lines = [
			`## ${test.titlePath().filter(Boolean).join(' › ')}`,
			'',
			`${relative(this.#root, file)}:${line}:${column}: ${result.status} after ${result.duration} ms${repeat}`,
		];
		const context = result.attachments.find((attachment) => attachment.name === 'error-context')?.path;
		if (context !== undefined) {
			lines.push(`Error context (the error, the page's aria snapshot, the test's source): ${context}`);
		}
		for (const error of result.errors) {
			lines.push('', ...formatError(error));
		}
		this.#failures.push(lines.join('\n'));
	}

	onError(error: TestError): void {
		const lines = ['## Outside the tests', '', ...formatError(error)];
		if (PORT_TAKEN.test(error.message ?? '')) {
			this.#hint = PORT_TAKEN_HINT;
			lines.push('', PORT_TAKEN_HINT);
		}
		this.#failures.push(lines.join('\n'));
	}

	onEnd(result: FullResult): void {
		if (this.#failures.length === 0) {
			return;
		}
		const header = `# e2e: ${result.status}, ${this.#failures.length} failure(s)`;
		mkdirSync(dirname(this.#outputFile), { recursive: true });
		writeFileSync(this.#outputFile, `${[header, ...this.#failures].join('\n\n')}\n`);
		console.log(`${this.#hint === undefined ? '' : `\n${this.#hint}`}\nThe failures in full: ${this.#outputFile}`);
	}
}

/** An error as the console shows it, without its colours: the message, the code that threw it, the stack. */
function formatError(error: TestError): string[] {
	const frames = (error.stack ?? '').split('\n').filter((line) => /^\s+at /u.test(line));
	const lines = ['```', stripVTControlCharacters(error.message ?? error.value ?? '')];
	if (error.snippet !== undefined) {
		lines.push('', stripVTControlCharacters(error.snippet));
	}
	if (frames.length > 0) {
		lines.push('', ...frames);
	}
	lines.push('```');
	if (error.cause !== undefined) {
		lines.push('', 'Caused by:', '', ...formatError(error.cause));
	}
	return lines;
}
