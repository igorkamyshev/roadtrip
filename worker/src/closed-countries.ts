// The closed countries of a ring request (spec «API кольца», «Порядок работы Worker'а», steps 2–3): the set the
// calculation avoids and the ring cache's key holds.
import { borderTable } from 'rules';

/**
 * There is no visa model yet, so whatever the citizenships and visas, the closed countries are those the border
 * table closes for everyone: alpha-3, sorted. The visa rules (#30) replace this step with the closed countries of
 * the citizenships' visa rules, reduced with the held visas, which may instead end in `visa_rules_missing`.
 */
export function closedCountries(): readonly string[] {
	return [...borderTable.closedForEveryone].sort();
}
