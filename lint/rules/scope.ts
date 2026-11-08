import type { Rule } from './rule.ts';

type Context = Parameters<NonNullable<Rule['create']>>[0];
type Node = Parameters<Context['sourceCode']['getScope']>[0];
type Scope = ReturnType<Context['sourceCode']['getScope']>;

/**
 * Whether `name` at `node` is the global: no scope around it declares the name. (Oxlint's `isGlobalReference` counts
 * only the globals a config declares.)
 */
export function isGlobal(context: Context, node: Node, name: string): boolean {
	for (let scope: Scope | null = context.sourceCode.getScope(node); scope !== null; scope = scope.upper) {
		const variable = scope.set.get(name);
		if (variable !== undefined && variable.defs.length > 0) {
			return false;
		}
	}
	return true;
}
