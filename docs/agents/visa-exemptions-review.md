# Monthly review of the visa exemptions' table

The Owner's schedule starts an agent with this file once a month (spec «Ежемесячная сверка таблицы исключений», #11). The run ends in one pull request that brings the visa exemptions' table and the Schengen area up to date with their sources. A country opens or closes only when the Owner merges it.

What you edit:

- `rules/src/visa-exemptions.ts`: the table. One row per country and visa (`SCHENGEN`, `USA`, `GBR` or `CAN`); the schema with every field's meaning is `VisaExemption` in `rules/src/index.ts`. The comment at the top of the file says where the rows came from and lists the rules left out and why: they are this review's leads.
- `rules/src/schengen.ts`: the Schengen area. A held Schengen visa opens all of it, and the engine puts no border delay between two of its countries.

The research the table started from, with every source, is `research/visa-exemptions` (issue #9 links it).

## Schedule

The Owner's routine «roadtrip: ежемесячная сверка визовой таблицы» (`trig_013UWVrYVQofPK1jVcEiuNuz`) fires on the 3rd of each month at 09:31, Europe/Belgrade, into one persistent cloud session of the same name (`session_01DPrp7mK1d8iUqh96sSWEKW`), which has this repository attached. Its prompt, in Russian, sends the run to this file.

- A routine that starts a fresh session each time gets no repository and no GitHub tools, so it cannot open the pull request: keep it firing into a session with the repository.
- The routine's prompt can be changed only from that session; from anywhere else, a change means a new routine into the same session, then deleting the old one.

## Steps

1. **Branch.** Start from the default branch on a branch `visa-exemptions/<YYYY-MM>`. Take today's date in UTC: it is the `checked` of every row you confirm, and the rows' last days compare with it.

2. **Expiring rows.** Find every row whose `until` falls within 60 days from today, or is already past (`grep -n "until:" rules/src/visa-exemptions.ts`). For each, look for the decision that extends or replaces it: the official gazette, the ministry's page. Done when each such row has one of:
   - a new `until` (or none) from a new official text, with that text added to `sources`;
   - its `until` confirmed, with a sentence in the PR saying the rule ends then and nothing extends it;
   - for a row already past its `until`: removed, since it acts no more.

3. **Every row.** Open every source of every row and compare the row with it: the country, the visa, what it gives (`visa_free`, or `evisa` for an e-visa, ETA or online permit), the last day, the citizenships, the conditions. Done when every row is one of:
   - confirmed: `checked` set to today;
   - changed: the fields fixed, `checked` today, the new source in `sources`;
   - removed: the source repeals it;
   - unreachable: no source opens and no other official one says the same. Leave the row and its `checked` as they are, and list it in the PR.

4. **Schengen.** Compare `SCHENGEN_AREA` with the European Commission's list (https://home-affairs.ec.europa.eu/policies/schengen/schengen-area_en), and the four entered through it (GIB, MCO, SMR, VAT) with their governments' entry rules. Cyprus joining in full, or Andorra changing its border, changes the table too: a country that joins Schengen loses its `SCHENGEN` row. A change to this list changes the border table's hash, so every cached ring misses once: say so in the PR.

5. **New rules.** For each of the four visas, look for countries that started letting its holders in, or stopped. Start with the leads in the file's top comment, then the neighbours of the countries in the table, then the rest of the world. Search official texts: laws, decrees, gazettes, ministries' and migration services' pages; secondary sources (news, Wikipedia, Fragomen) are only a lead to an official text. Done when every lead in the comment has an outcome: a new row from an official source, or still left out with today's reason.

6. **Check.** Run `pnpm test` (the table's check, `visaExemptionsProblems`), `pnpm typecheck` and `pnpm e2e`. The screen test `web/e2e/held-visas.spec.ts` counts what each visa opens for a Russian and an Indian on fixed days and names the countries behind each count: when a change of the table changes a count, update the numbers and the list of countries in its comment together.

7. **PR.** Open the pull request into the default branch, its title and body in Russian, like the issues:
   - every row changed, added or removed: the country, the visa, what changed, the source with the article or section;
   - every country that opens or closes for someone as a result, and for which citizenships;
   - the rows confirmed unchanged, and the unreachable ones;
   - the rows whose last day comes within the next 60 days, with what the sources say about after it.

## Rules for a row

- **One visa per row**: a country that lets in holders of three of the visas has three rows.
- **A visa and a residence permit are one held visa** (#11). A row stands when either one opens the country; the conditions say which, and how many entries, how long valid, used before.
- **`until`** is the last day the source names, inclusive. Leave it out for a rule without an end.
- **`citizenships`**: only when the source lists them, every code an alpha-3 of `COUNTRIES` (Kosovo is `RKS`), sorted. A rule for a group the source does not list (as «category B») waits among the leads.
- **`conditions`**: in Russian, for people; the reduction never reads them.
- **`sources`**: official texts first; a secondary source stays only beside one, and `notes` says what is uncertain.
- **A country closed for everyone** (the border table's `closedForEveryone`) has no row: keep its rule in the top comment, so the row comes back when the country reopens.
- **Only the four visas.** A rule that names other visas (Japan, Australia, Ireland) counts here only for its part about the four.
