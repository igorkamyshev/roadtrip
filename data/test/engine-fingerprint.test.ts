// The engine's fingerprint (engine/AGENTS.md, «Engine version»): the sources a ring's answer depends on, hashed and
// recorded next to ENGINE_VERSION, so a change to one of them fails here until the version is reconsidered. Here
// because every package's tests run under data's vitest and types.
import { ENGINE_FINGERPRINT } from 'engine/version';
import { describe, expect, it } from 'vitest';
import { checkoutSource as checkout, engineFingerprint as fingerprint } from '../src/engine-fingerprint.ts';

describe('the engine fingerprint', () => {
	it('is the one recorded next to ENGINE_VERSION', async () => {
		const sources = await fingerprint(checkout);

		// oxlint-disable-next-line vitest/valid-expect -- vitest's expect takes a message, here the fingerprint to record
		expect(
			sources,
			'A source of the ring’s answer changed (ENGINE_SOURCES in engine/src/version.ts). If the change can change ' +
				'any ring, bump ENGINE_VERSION there. Either way, record the sources’ fingerprint there: ' +
				`pnpm --filter data engine-fingerprint, or ENGINE_FINGERPRINT = '${sources}'`,
		).toBe(ENGINE_FINGERPRINT);
	});

	it('is the same in a checkout with CRLF line endings', async () => {
		expect(await fingerprint((path) => checkout(path).replaceAll('\n', '\r\n'))).toBe(await fingerprint(checkout));
	});
});
