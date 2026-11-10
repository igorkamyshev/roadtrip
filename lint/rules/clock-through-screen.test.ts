import { clockThroughScreen } from './clock-through-screen.ts';
import { ruleTester } from './rule-tester.ts';

ruleTester().run('clock-through-screen', clockThroughScreen, {
	valid: [
		'await holdTheClock(page);',
		'await page.clock.runFor(16);',
		'await page.clock.pauseAt(START + 1000);',
		'await page.clock.resume();',
		'await deps.install();',
		'await page.install();',
		"await deps.setSystemTime(new Date('2027-01-01T00:00:00Z'));",
	],
	invalid: [
		{ code: 'await page.clock.install();', errors: [{ message: /holdTheClock/u }] },
		{ code: 'await page.clock.install({ time: START });', errors: [{ message: /holdTheClock/u }] },
		{ code: 'const { clock } = page; await clock.install();', errors: [{ message: /holdTheClock/u }] },
		{ code: "await page.clock['install']();", errors: [{ message: /holdTheClock/u }] },
		// Each installs the clock when none is and leaves it running: Playwright's Clock#_installIfNeeded resumes it.
		{ code: "await page.clock.setSystemTime(new Date('2027-01-01T00:00:00Z'));", errors: [{ message: /holdTheClock/u }] },
		{ code: 'await page.clock.setFixedTime(START);', errors: [{ message: /holdTheClock/u }] },
		{ code: "const { clock } = page; await clock['setFixedTime'](START);", errors: [{ message: /holdTheClock/u }] },
	],
});
