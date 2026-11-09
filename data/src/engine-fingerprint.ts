// The engine's fingerprint (engine/AGENTS.md, «Engine version»): the sources a ring's answer depends on, hashed and
// recorded next to ENGINE_VERSION. data/test/engine-fingerprint.test.ts checks the recorded one, and the command
// engine-fingerprint records a new one.
import { readFileSync } from 'node:fs';
import { sha256Hex } from 'engine';
import { ENGINE_SOURCES } from 'engine/version';

/** The repository's root, which ENGINE_SOURCES' paths start from. */
export const REPOSITORY_ROOT = new URL('../../', import.meta.url);

/** A source's text in this checkout. */
export const checkoutSource = (path: string): string => readFileSync(new URL(path, REPOSITORY_ROOT), 'utf8');

/** SHA-256 of the sources' texts one after another in the order of their paths, with LF line endings. */
export function engineFingerprint(read: (path: string) => string): Promise<string> {
	return sha256Hex(
		ENGINE_SOURCES.toSorted()
			.map((path) => read(path).replaceAll(/\r\n?/gu, '\n'))
			.join(''),
	);
}
