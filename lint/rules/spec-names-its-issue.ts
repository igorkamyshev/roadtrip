import type { Rule } from './rule.ts';

/** A mention of the spec without its issue: the word `spec`, then a section in guillemets. */
const BARE_MENTION = /\bspec(?=\s+«)/giu;
/** What goes after `spec`. */
const ISSUE = ' #20';
/** Where a comment's text starts: after `//` or `/*`. */
const OPENER_LENGTH = 2;

const MESSAGE =
	'Name the spec by its issue, `spec #20 «Экран»`, so that a reader finds the section in docs/specs/20.md with its amendments.';

/** A mention of the spec names its issue and section (CODING_STANDARDS.md, Decisions and docs). */
export const specNamesItsIssue: Rule = {
	meta: {
		type: 'suggestion',
		docs: { description: 'Mention the spec in a comment as `spec #20 «Section»`.' },
		fixable: 'code',
	},
	create(context) {
		return {
			Program() {
				for (const comment of context.sourceCode.getAllComments()) {
					const textStart = comment.range[0] + OPENER_LENGTH;
					const ends = [...comment.value.matchAll(BARE_MENTION)].map((match) => textStart + match.index + match[0].length);
					if (ends.length > 0) {
						context.report({
							node: comment,
							message: MESSAGE,
							fix: (fixer) => ends.map((end) => fixer.insertTextAfterRange([end, end], ISSUE)),
						});
					}
				}
			},
		};
	},
};
