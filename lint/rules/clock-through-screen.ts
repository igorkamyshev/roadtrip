import type { Rule } from './rule.ts';

const MESSAGE =
	"Hold the page's clock with `holdTheClock` of e2e/screen.ts, and run it with `runUntil`, `settle` or `page.clock.runFor`: an e2e test drives the page's time with `page.clock`, paused (CODING_STANDARDS.md, Tests).";

/** A node as far as this rule reads it. */
interface Node {
	readonly type: string;
	readonly name?: unknown;
	readonly value?: unknown;
	readonly computed?: boolean;
	readonly object?: Node;
	readonly property?: Node;
}

/** The name `node` stands for: an identifier's, or a string's, as in `clock['install']`. */
function nameOf(node: Node | undefined): unknown {
	return node?.type === 'Identifier' ? node.name : node?.value;
}

/** The property a member expression reads: `clock.install` and `clock['install']` alike, not `clock[install]`. */
function propertyOf(node: Node): unknown {
	return node.type === 'MemberExpression' && (node.computed !== true || node.property?.type === 'Literal')
		? nameOf(node.property)
		: undefined;
}

/** Whether `node` is the page's clock: `page.clock`, or a `clock` taken from it. */
function isClock(node: Node | undefined): boolean {
	return node !== undefined && (node.type === 'Identifier' ? node.name === 'clock' : propertyOf(node) === 'clock');
}

/**
 * The screen's tests hold the page's clock in one place, `holdTheClock` of e2e/screen.ts: a clock installed elsewhere
 * runs on its own, and a busy machine changes what the test sees (#116).
 */
export const clockThroughScreen: Rule = {
	meta: { type: 'problem', docs: { description: "Hold the page's clock through holdTheClock of e2e/screen.ts." } },
	create(context) {
		return {
			CallExpression(node) {
				const callee: Node = node.callee;
				if (propertyOf(callee) === 'install' && isClock(callee.object)) {
					context.report({ node, message: MESSAGE });
				}
			},
		};
	},
};
