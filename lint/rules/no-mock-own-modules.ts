import type { Rule } from './rule.ts';

const MOCKS = new Set(['mock', 'doMock']);

/** `vi.mock('<path>')` and `vi.mock(import('<path>'))`: the module path, when it is a literal. */
function mockedPath(argument: unknown): string | undefined {
	if (typeof argument !== 'object' || argument === null || !('type' in argument)) {
		return undefined;
	}
	if (argument.type === 'Literal' && 'value' in argument && typeof argument.value === 'string') {
		return argument.value;
	}
	if (argument.type === 'ImportExpression' && 'source' in argument) {
		return mockedPath(argument.source);
	}
	return undefined;
}

/** The `packages` option: the names of this repository's workspace packages. */
function workspacePackages(options: readonly unknown[]): string[] {
	const [first] = options;
	if (typeof first !== 'object' || first === null || !('packages' in first) || !Array.isArray(first.packages)) {
		return [];
	}
	return first.packages.filter((name): name is string => typeof name === 'string');
}

/** A test doubles only external boundaries, through `deps` (CODING_STANDARDS.md, Tests). */
export const noMockOwnModules: Rule = {
	meta: {
		type: 'problem',
		docs: { description: 'Do not vi.mock a module of this repository; pass a double in deps.' },
		schema: [{ type: 'object', properties: { packages: { type: 'array', items: { type: 'string' } } }, additionalProperties: false }],
	},
	create(context) {
		const packages = workspacePackages(context.options);
		const own = (path: string): boolean => path.startsWith('.') || packages.some((name) => path === name || path.startsWith(`${name}/`));
		return {
			CallExpression(node) {
				const { callee } = node;
				if (callee.type !== 'MemberExpression' || callee.computed) {
					return;
				}
				if (callee.object.type !== 'Identifier' || callee.object.name !== 'vi' || !MOCKS.has(callee.property.name)) {
					return;
				}
				const path = mockedPath(node.arguments[0]);
				if (path === undefined || !own(path)) {
					return;
				}
				context.report({
					node,
					message: `Do not vi.mock '${path}', a module of this repository: pass a double of the external boundary in its deps argument.`,
				});
			},
		};
	},
};
