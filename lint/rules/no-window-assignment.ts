import type { Rule } from './rule.ts';
import { isGlobal } from './scope.ts';

/** The page's global objects. */
const GLOBALS = new Set(['window', 'globalThis']);
/** `Object.<method>(target, …)`: the calls that put properties on their first argument. */
const DEFINERS = new Set(['assign', 'defineProperty', 'defineProperties']);
/** The TypeScript wrappers an expression keeps its value through: `(window as Hooks)`, `window!`, `<Hooks>window`. */
const WRAPPERS = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression', 'TSTypeAssertion', 'ParenthesizedExpression']);

const MESSAGE =
	'No test hooks in production: put nothing on window or globalThis. A test reads the page as a person does, or an event the app sends anyway.';

/** The expression under the TypeScript wrappers, if any. */
function unwrapped(node: unknown): unknown {
	let inner = node;
	while (
		typeof inner === 'object' &&
		inner !== null &&
		'type' in inner &&
		typeof inner.type === 'string' &&
		WRAPPERS.has(inner.type) &&
		'expression' in inner
	) {
		inner = inner.expression;
	}
	return inner;
}

/** The name of the page's global object that `node` is (`window`, `globalThis`), else undefined. */
function globalObject(node: unknown): string | undefined {
	const inner = unwrapped(node);
	if (typeof inner !== 'object' || inner === null || !('type' in inner) || inner.type !== 'Identifier' || !('name' in inner)) {
		return undefined;
	}
	return typeof inner.name === 'string' && GLOBALS.has(inner.name) ? inner.name : undefined;
}

/** Production code carries no test hooks (ADR 0002, its own rules). */
export const noWindowAssignment: Rule = {
	meta: { type: 'problem', docs: { description: 'Put no property on window or globalThis.' } },
	create(context) {
		return {
			AssignmentExpression(node) {
				const { left } = node;
				const name = left.type === 'MemberExpression' ? globalObject(left.object) : undefined;
				if (name !== undefined && isGlobal(context, node, name)) {
					context.report({ node, message: MESSAGE });
				}
			},
			CallExpression(node) {
				const { callee } = node;
				if (
					callee.type !== 'MemberExpression' ||
					callee.computed ||
					callee.object.type !== 'Identifier' ||
					callee.object.name !== 'Object'
				) {
					return;
				}
				const name = DEFINERS.has(callee.property.name) ? globalObject(node.arguments[0]) : undefined;
				if (name !== undefined && isGlobal(context, node, name)) {
					context.report({ node, message: MESSAGE });
				}
			},
		};
	},
};
