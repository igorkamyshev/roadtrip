import type { Rule } from './rule.ts';
import { isGlobal } from './scope.ts';

const TIMERS = new Set(['setTimeout', 'setInterval']);

const TIMERS_MESSAGE =
	'Take the timers from deps (`deps.sleep`), so a test moves their time; only the entry, worker/src/index.ts, builds them.';
const CLOCK_MESSAGE = 'Take the clock from deps (`deps.now`), so a test sets the time; only the entry, worker/src/index.ts, builds it.';
const FAKE_MESSAGE = "Move the time on deps' clock and timers (worker/test/timers.ts: Clock, timersOn), not by faking the globals with vi.";

/** `object.method(…)`: the calls that read the global clock or fake it, with what to do instead. */
const METHODS = new Map([
	['Date.now', CLOCK_MESSAGE],
	['performance.now', CLOCK_MESSAGE],
	['vi.useFakeTimers', FAKE_MESSAGE],
	['vi.setSystemTime', FAKE_MESSAGE],
]);

/** The Worker takes its clock and timers from deps, built in its entry (CODING_STANDARDS.md, Where code goes; ADR 0002). */
export const timeThroughDeps: Rule = {
	meta: { type: 'problem', docs: { description: 'Take the clock and the timers from deps, not from the globals.' } },
	create(context) {
		return {
			// `new Date()` reads the clock; `new Date(ms)` does not.
			NewExpression(node) {
				if (
					node.callee.type === 'Identifier' &&
					node.callee.name === 'Date' &&
					node.arguments.length === 0 &&
					isGlobal(context, node, 'Date')
				) {
					context.report({ node, message: CLOCK_MESSAGE });
				}
			},
			CallExpression(node) {
				const { callee } = node;
				if (callee.type === 'Identifier' && TIMERS.has(callee.name) && isGlobal(context, node, callee.name)) {
					context.report({ node, message: TIMERS_MESSAGE });
					return;
				}
				if (callee.type !== 'MemberExpression' || callee.computed || callee.object.type !== 'Identifier') {
					return;
				}
				const { name } = callee.object;
				const message = METHODS.get(`${name}.${callee.property.name}`);
				// vitest's `vi` is imported; Date and performance count only as the globals.
				if (message !== undefined && (name === 'vi' || isGlobal(context, node, name))) {
					context.report({ node, message });
				}
			},
		};
	},
};
