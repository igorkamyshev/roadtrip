// The data version of the ring cache key (spec #20 «Кэш колец»): the dataset's version, the border table's hash and
// the engine's version.
import { borderTableHash, dataVersion } from 'engine';
import { borderTable } from 'rules';
import { describe, expect, it } from 'vitest';
import { rules } from './rules.ts';

// SHA-256 of the table of rules() as JSON, by `sha256sum`:
// {"defaultBorderHours":1.5,"pairs":[],"crossings":[],"closedForEveryone":[],"closedTerritories":[],"schengen":[]}
const RULES_HASH = '1417ac76925644a73770f82f36bd198d0ba624cceb4c8999c1570931aa07b338';

describe('the data version', () => {
	it('holds the dataset version, the border table’s hash and the engine version', async () => {
		expect(await borderTableHash(rules())).toBe(RULES_HASH);
		expect(await dataVersion('2026-11-01', rules())).toBe('2026-11-01.1417ac76925644a7.8');
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
