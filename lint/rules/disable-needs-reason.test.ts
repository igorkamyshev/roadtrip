import { disableNeedsReason } from './disable-needs-reason.ts';
import { ruleTester } from './rule-tester.ts';

ruleTester().run('disable-needs-reason', disableNeedsReason, {
	valid: [
		'// An ordinary comment\nconsole.log(1);',
		'// oxlint-disable-next-line no-console -- the CLI prints its report\nconsole.log(1);',
		'console.log(1); // oxlint-disable-line no-console -- the CLI prints its report',
		'// eslint-disable-next-line no-console, no-alert -- a dev page\nalert(1);',
		'// fallow-ignore-next-line code-duplication -- a fixture repeated on purpose\nconst en = 1;',
	],
	invalid: [
		{
			code: '// oxlint-disable-next-line no-console\nconsole.log(1);',
			errors: [{ message: /reason/u }],
		},
		{
			code: '// oxlint-disable-next-line no-console --   \nconsole.log(1);',
			errors: [{ message: /reason/u }],
		},
		{
			code: '// eslint-disable-next-line no-console\nconsole.log(1);',
			errors: [{ message: /reason/u }],
		},
		{
			code: '// oxlint-disable-next-line -- every rule, for no rule in particular\nconsole.log(1);',
			errors: [{ message: /name the rule/u }],
		},
		{
			code: '/* oxlint-disable no-console -- the whole file */\nconsole.log(1);',
			errors: [{ message: /one line/u }],
		},
		{
			code: '/* eslint-enable no-console */\nconsole.log(1);',
			errors: [{ message: /one line/u }],
		},
		{
			code: '// fallow-ignore-file unused-export -- the whole module\nexport const a = 1;',
			errors: [{ message: /one line/u }],
		},
		{
			code: '// fallow-ignore-next-line unused-export\nexport const a = 1;',
			errors: [{ message: /reason/u }],
		},
	],
});
