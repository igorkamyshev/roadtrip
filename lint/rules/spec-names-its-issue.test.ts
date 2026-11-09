import { ruleTester } from './rule-tester.ts';
import { specNamesItsIssue } from './spec-names-its-issue.ts';

ruleTester().run('spec-names-its-issue', specNamesItsIssue, {
	valid: [
		'// An ordinary comment\nconst a = 1;',
		'// The one screen (spec #20 «Экран»).\nconst a = 1;',
		'// How the border table applies (spec #20 «Движок», «Кольцо»).\nconst a = 1;',
		'/** The default citizenship (spec #20 «При загрузке»). */\nconst a = 1;',
		'// The specs of the screen and «Экран» as a word.\nconst a = 1;',
		'// The respec «X» is no mention of the spec.\nconst a = 1;',
		// A string the program uses is not a comment.
		"const label = 'spec «Экран»';",
	],
	invalid: [
		{
			code: '// The one screen (spec «Экран»).\nconst a = 1;',
			errors: [{ message: /spec #20/u }],
			output: '// The one screen (spec #20 «Экран»).\nconst a = 1;',
		},
		{
			code: '// How the border table applies (spec «Движок», «Кольцо»).\nconst a = 1;',
			errors: [{ message: /spec #20/u }],
			output: '// How the border table applies (spec #20 «Движок», «Кольцо»).\nconst a = 1;',
		},
		{
			code: '/** The default citizenship (spec «При загрузке»). */\nconst a = 1;',
			errors: [{ message: /spec #20/u }],
			output: '/** The default citizenship (spec #20 «При загрузке»). */\nconst a = 1;',
		},
		{
			code: 'const a = 1; // the ring (spec «Кэш колец»; spec «API кольца»)',
			errors: [{ message: /spec #20/u }],
			output: 'const a = 1; // the ring (spec #20 «Кэш колец»; spec #20 «API кольца»)',
		},
		{
			code: '/*\n * Spec «Экран» at the start of a sentence.\n */\nconst a = 1;',
			errors: [{ message: /spec #20/u }],
			output: '/*\n * Spec #20 «Экран» at the start of a sentence.\n */\nconst a = 1;',
		},
	],
});
