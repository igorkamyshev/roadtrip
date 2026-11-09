// Records the engine's fingerprint (engine/AGENTS.md, «Engine version») in engine/src/version.ts, and says whether it
// changed. Whether ENGINE_VERSION goes up with it stays a person's call: it does when any ring can come out otherwise.
//
//   pnpm --filter data engine-fingerprint
import { readFileSync, writeFileSync } from 'node:fs';
import { ENGINE_FINGERPRINT, ENGINE_VERSION } from 'engine/version';
import { checkoutSource, engineFingerprint, REPOSITORY_ROOT } from '../engine-fingerprint.ts';
import { log } from './input.ts';

const versionFile = new URL('engine/src/version.ts', REPOSITORY_ROOT);
const fingerprint = await engineFingerprint(checkoutSource);
if (fingerprint === ENGINE_FINGERPRINT) {
	log(`ENGINE_FINGERPRINT is the sources' already: ${fingerprint}`);
} else {
	const text = readFileSync(versionFile, 'utf8');
	writeFileSync(versionFile, text.replace(`'${ENGINE_FINGERPRINT}'`, `'${fingerprint}'`));
	log(
		`ENGINE_FINGERPRINT: ${ENGINE_FINGERPRINT} → ${fingerprint}. ENGINE_VERSION is ${ENGINE_VERSION}: ` +
			'bump it if any ring can come out otherwise; leave it if every ring stays as it was.',
	);
}
