import { ruleTester } from './rule-tester.ts';
import { timeThroughDeps } from './time-through-deps.ts';

ruleTester().run('time-through-deps', timeThroughDeps, {
	valid: [
		'await deps.sleep(10_000);',
		'function wait({ setTimeout }) { setTimeout(resolve, 10_000); }',
		'const started = deps.now();',
		'const performance = { now: () => 0 }; performance.now();',
		'const today = new Date(deps.now());',
		"const until = new Date('2026-11-07');",
		'await timers.advance(10_000);',
	],
	invalid: [
		{ code: 'setTimeout(resolve, 10_000);', errors: [{ message: /timers from deps/u }] },
		{ code: 'setInterval(tick, 1000);', errors: [{ message: /timers from deps/u }] },
		{ code: 'const started = Date.now();', errors: [{ message: /clock from deps/u }] },
		{ code: 'const started = performance.now();', errors: [{ message: /clock from deps/u }] },
		{ code: 'const today = new Date();', errors: [{ message: /clock from deps/u }] },
		{ code: 'vi.useFakeTimers();', errors: [{ message: /deps' clock/u }] },
		{ code: 'vi.setSystemTime(START);', errors: [{ message: /deps' clock/u }] },
	],
});
