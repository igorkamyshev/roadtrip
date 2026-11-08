import type { Rule } from './rule.ts';

/** A Worker's errors reach PostHog through error-tracking's logger and its Tail Worker only (error-tracking/README.md). */
export const noCaptureException: Rule = {
	meta: { type: 'problem', docs: { description: 'Report errors with logger.error, never captureException.' } },
	create(context) {
		return {
			MemberExpression(node) {
				const name = node.computed ? (node.property.type === 'Literal' ? node.property.value : undefined) : node.property.name;
				if (name !== 'captureException') {
					return;
				}
				context.report({
					node,
					message: 'Report a Worker error with `logger.error(message, error, context)` from error-tracking/logger, not captureException.',
				});
			},
		};
	},
};
