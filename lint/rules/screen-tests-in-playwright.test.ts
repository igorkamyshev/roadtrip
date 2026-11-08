import { ruleTester } from './rule-tester.ts';
import { screenTestsInPlaywright } from './screen-tests-in-playwright.ts';

ruleTester().run('screen-tests-in-playwright', screenTestsInPlaywright, {
	valid: [
		{ code: 'export {};', filename: 'web/src/screen/phrase.tsx' },
		{ code: 'export {};', filename: 'web/src/cities/search.ts' },
	],
	invalid: [
		{ code: 'export {};', filename: 'web/src/cities/search.test.ts', errors: [{ message: /Playwright/u }] },
		{ code: 'export {};', filename: 'web/src/screen/phrase.test.tsx', errors: [{ message: /Playwright/u }] },
		{ code: 'export {};', filename: 'web/src/screen/phrase.spec.tsx', errors: [{ message: /Playwright/u }] },
	],
});
