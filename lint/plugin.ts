// roadtrip's own lint rules, loaded by Oxlint as a JS plugin (`jsPlugins` in .oxlintrc.json).
// Each rule turns a line of CODING_STANDARDS.md or ADR 0002 into a check.
import { disableNeedsReason } from './rules/disable-needs-reason.ts';
import { jsonThroughEngine } from './rules/json-through-engine.ts';
import { noCaptureException } from './rules/no-capture-exception.ts';
import { noMockOwnModules } from './rules/no-mock-own-modules.ts';
import { noWindowAssignment } from './rules/no-window-assignment.ts';
import { screenTestsInPlaywright } from './rules/screen-tests-in-playwright.ts';
import { specNamesItsIssue } from './rules/spec-names-its-issue.ts';
import { timeThroughDeps } from './rules/time-through-deps.ts';

export default {
	meta: { name: 'roadtrip' },
	rules: {
		'disable-needs-reason': disableNeedsReason,
		'json-through-engine': jsonThroughEngine,
		'no-capture-exception': noCaptureException,
		'no-mock-own-modules': noMockOwnModules,
		'no-window-assignment': noWindowAssignment,
		'screen-tests-in-playwright': screenTestsInPlaywright,
		'spec-names-its-issue': specNamesItsIssue,
		'time-through-deps': timeThroughDeps,
	},
};
