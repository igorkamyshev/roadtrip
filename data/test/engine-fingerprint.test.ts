// The engine's fingerprint (engine/AGENTS.md, «Engine version»): the sources a ring's answer depends on, hashed and
// recorded next to ENGINE_VERSION, so a change to one of them fails here until the version is reconsidered. Here
// because every package's tests run under data's vitest and types.
import { readFileSync } from 'node:fs';
import { sha256Hex } from 'engine';
import { ENGINE_FINGERPRINT, ENGINE_SOURCES } from 'engine/version';
import { describe, expect, it } from 'vitest';

const root = new URL('../../', import.meta.url);

const checkout = (path: string) => readFileSync(new URL(path, root), 'utf8');

/** SHA-256 of the sources' texts one after another in the order of their paths, with LF line endings. */
function fingerprint(read: (path: string) => string): Promise<string> {
	return sha256Hex(
		[...ENGINE_SOURCES]
			.sort()
			.map((path) => read(path).replace(/\r\n?/gu, '\n'))
			.join(''),
	);
}

describe('the engine fingerprint', () => {
	it('is the one recorded next to ENGINE_VERSION', async () => {
		const sources = await fingerprint(checkout);

		expect(
			sources,
			'A source of the ring’s answer changed (ENGINE_SOURCES in engine/src/version.ts). If the change can change ' +
				'any ring, bump ENGINE_VERSION there. Either way, record the sources’ fingerprint there: ' +
				`ENGINE_FINGERPRINT = '${sources}'`,
		).toBe(ENGINE_FINGERPRINT);
	});

	it('is the same in a checkout with CRLF line endings', async () => {
		expect(await fingerprint((path) => checkout(path).replace(/\n/gu, '\r\n'))).toBe(await fingerprint(checkout));
	});
});
