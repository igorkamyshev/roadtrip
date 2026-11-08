import type { Rule } from './rule.ts';

// `oxlint-disable-next-line rule-a, rule-b -- why`, and the eslint- spelling Oxlint also honours.
const LINT_DIRECTIVE = /^\s*(?:oxlint|eslint)-(?:disable|enable)(?<scope>-next-line|-line)?(?<rules>[^]*?)(?:--(?<reason>[^]*))?$/u;
// `fallow-ignore-next-line issue-type -- why`; `fallow-ignore-file` covers a whole file.
const FALLOW_DIRECTIVE = /^\s*fallow-ignore-(?:(?<scope>next-line)|file)(?<rules>[^]*?)(?:--(?<reason>[^]*))?$/u;

/** A named group of the match; undefined when an optional group did not match (TypeScript types them all as strings). */
function group(match: RegExpExecArray, name: 'scope' | 'rules' | 'reason'): string | undefined {
	return match.groups?.[name];
}

/** What is wrong with a comment that switches a check off, or undefined when it is fine or switches nothing off. */
function directiveProblem(text: string): string | undefined {
	const match = LINT_DIRECTIVE.exec(text) ?? FALLOW_DIRECTIVE.exec(text);
	if (match === null) {
		return undefined;
	}
	const [scope, rules, reason] = [group(match, 'scope'), group(match, 'rules'), group(match, 'reason')];
	if (scope === undefined) {
		return 'Disable a rule for one line (`-next-line` or `-line`), not for a block or a file.';
	}
	if (rules === undefined || rules.trim() === '') {
		return 'A disable comment must name the rule it disables.';
	}
	if (reason === undefined || reason.trim() === '') {
		return 'A disable comment needs a reason after ` -- `.';
	}
	return undefined;
}

/** A check is switched off for one line at a time, by name, with the reason written down (ADR 0002). */
export const disableNeedsReason: Rule = {
	meta: { type: 'problem', docs: { description: 'Disable a rule for one line only, name it, and say why.' } },
	create(context) {
		return {
			Program() {
				for (const comment of context.sourceCode.getAllComments()) {
					const message = directiveProblem(comment.value);
					if (message !== undefined) {
						context.report({ node: comment, message });
					}
				}
			},
		};
	},
};
