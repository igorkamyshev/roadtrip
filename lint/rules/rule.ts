import type { RuleTester } from 'oxlint/plugins-dev';

/** An Oxlint JS plugin rule. Oxlint exports the type only through `RuleTester`. */
export type Rule = Parameters<RuleTester['run']>[1];
