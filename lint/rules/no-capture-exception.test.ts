import { noCaptureException } from './no-capture-exception.ts';
import { ruleTester } from './rule-tester.ts';

ruleTester().run('no-capture-exception', noCaptureException, {
	valid: ["logger.error('Sherpa failed', error, { distinct_id, reason });", 'posthog.capture({ distinctId, event });'],
	invalid: [
		{ code: 'posthog.captureException(error);', errors: [{ message: /logger\.error/u }] },
		{ code: 'client?.captureException(error, distinctId);', errors: [{ message: /logger\.error/u }] },
		{ code: "posthog['captureException'](error);", errors: [{ message: /logger\.error/u }] },
	],
});
