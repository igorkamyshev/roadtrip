import { noMockOwnModules } from './no-mock-own-modules.ts';
import { ruleTester } from './rule-tester.ts';

const options = [{ packages: ['error-tracking', 'engine'] }];

ruleTester().run('no-mock-own-modules', noMockOwnModules, {
	valid: [
		{ code: "vi.mock('posthog-node');", options },
		{ code: "vi.mock(import('pmtiles'));", options },
		{ code: "vi.spyOn(console, 'error');", options },
		{ code: "vi.mock('error-tracking-extra');", options },
	],
	invalid: [
		{ code: "vi.mock('./sherpa');", options, errors: [{ message: /deps/u }] },
		{ code: "vi.doMock('../analytics', () => ({}));", options, errors: [{ message: /deps/u }] },
		{ code: "vi.mock(import('./time'));", options, errors: [{ message: /deps/u }] },
		{ code: "vi.mock('error-tracking/logger');", options, errors: [{ message: /deps/u }] },
		{ code: "vi.mock('engine/protocol');", options, errors: [{ message: /deps/u }] },
	],
});
