import type { Rule } from './rule.ts';

const EQUALITIES = new Set(['===', '!==', '==', '!=']);

/**
 * Untyped values are checked for an object by engine/json's isRecord (field, items for their parts), one helper
 * for engine, data and the Worker (CODING_STANDARDS.md, Where code goes; ADR 0002).
 */
export const jsonThroughEngine: Rule = {
	meta: { type: 'problem', docs: { description: 'Check for an object with isRecord from engine/json.' } },
	create(context) {
		return {
			BinaryExpression(node) {
				const sides = [node.left, node.right];
				const typeofCheck = sides.some((side) => side.type === 'UnaryExpression' && side.operator === 'typeof');
				const objectLiteral = sides.some((side) => side.type === 'Literal' && side.value === 'object');
				if (EQUALITIES.has(node.operator) && typeofCheck && objectLiteral) {
					context.report({
						node,
						message:
							'Check for an object with isRecord from engine/json, and read its fields with field and items: one helper for engine, data and the Worker.',
					});
				}
			},
		};
	},
};
