// The data version of the ring cache key (spec «Кэш колец»): the dataset's version, the border table's hash and
// the engine's version.
import { borderTableHash, dataVersion, ENGINE_VERSION } from 'engine';
import { borderTable } from 'rules';
import { describe, expect, it } from 'vitest';

describe('the data version', () => {
	it('holds the dataset version, the border table’s hash and the engine version', async () => {
		const hash = await borderTableHash(borderTable);

		expect(hash).toMatch(/^[0-9a-f]{64}$/u);
		expect(await dataVersion('2026-11-01', borderTable)).toBe(`2026-11-01.${hash.slice(0, 16)}.${ENGINE_VERSION}`);
	});

	it('is the same for an equal border table', async () => {
		expect(await dataVersion('2026-11-01', structuredClone(borderTable))).toBe(await dataVersion('2026-11-01', borderTable));
	});

	it('changes with any change to the border table', async () => {
		const version = await dataVersion('2026-11-01', borderTable);
		const [first, ...others] = borderTable.crossings;

		expect(await dataVersion('2026-11-01', { ...borderTable, defaultBorderHours: 2 })).not.toBe(version);
		expect(await dataVersion('2026-11-01', { ...borderTable, crossings: [{ ...first, status: 'closed' }, ...others] })).not.toBe(version);
	});
});
