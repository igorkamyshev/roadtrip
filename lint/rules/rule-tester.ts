import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vitest';

/** A RuleTester whose cases run as vitest tests and are parsed as TypeScript, as our code is. */
export function ruleTester(): RuleTester {
	RuleTester.describe = (text, fn) => {
		// oxlint-disable-next-line vitest/valid-title, vitest/valid-describe-callback -- RuleTester names the suite and passes its cases as fn
		describe(text, fn);
	};
	RuleTester.it = (text, fn) => {
		// oxlint-disable-next-line vitest/valid-title, vitest/expect-expect -- RuleTester names each case and asserts inside fn
		it(text, fn);
	};
	return new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });
}
