// The cities file (spec «Набор данных», «Файл городов»): GeoNames' cities from 15 000 people without sections of
// cities and vanished places, their Russian names from GeoNames or else Wikidata, and their zones by the graph's
// polygons. The inputs are lines in GeoNames' own formats (cities1000.txt, alternateNamesV2.txt) and a double of
// Wikidata; the zones are those of zones.osm (its header has the squares).
import { describe, expect, it } from 'vitest';
import { buildCities, type CitiesSources } from '../src/cities.ts';
import { fixtureGraph } from './fixture-graph.ts';

const zones = fixtureGraph('zones.osm');

interface Place {
	readonly id: number;
	readonly name: string;
	readonly lat: number;
	readonly lon: number;
	readonly population: number;
	/** GeoNames' feature code: PPL, PPLA, PPLC, PPLX… */
	readonly code?: string;
	/** GeoNames' country, alpha-2. */
	readonly country?: string;
}

/** A line of cities1000.txt: 19 columns separated by tabs. */
function cityLine({ id, name, lat, lon, population, code = 'PPL', country = 'CY' }: Place): string {
	return [id, name, name, '', lat, lon, 'P', code, country, '', '01', '', '', '', population, '', '10', 'Asia/Nicosia', '2026-01-01'].join('\t');
}

interface AlternateName {
	readonly id: number;
	readonly name: string;
	readonly language?: string;
	readonly preferred?: boolean;
	readonly short?: boolean;
	readonly colloquial?: boolean;
	readonly historic?: boolean;
	/** Until when the name was used. */
	readonly to?: string;
}

let alternateNameId = 1;

/** A line of alternateNamesV2.txt: 10 columns separated by tabs, the flags `1` or empty. */
function nameLine({ id, name, language = 'ru', preferred, short, colloquial, historic, to = '' }: AlternateName): string {
	const flag = (set: boolean | undefined) => (set ? '1' : '');
	return [alternateNameId++, id, language, name, flag(preferred), flag(short), flag(colloquial), flag(historic), '', to].join('\t');
}

async function* lines(values: readonly string[]): AsyncIterable<string> {
	yield* values;
}

/** Wikidata with no Russian labels, recording what it is asked. */
function noWikidata(asked: number[][] = []): CitiesSources['wikidataLabels'] {
	return async (ids) => {
		asked.push([...ids]);
		return new Map();
	};
}

function build(places: readonly Place[], names: readonly AlternateName[] = [], wikidataLabels = noWikidata()) {
	return buildCities({ cities: lines(places.map(cityLine)), alternateNames: lines(names.map(nameLine)), wikidataLabels, graph: zones });
}

// A point inside Cyprus (2°–4°E) and outside Northern Cyprus (2.2°–2.8°E).
const IN_CYPRUS = { lat: 0.5, lon: 3.5 };

describe('the cities file', () => {
	it('holds the places of 15 000 people and more, without sections of cities and vanished places', async () => {
		const { file } = await build([
			{ id: 1, name: 'Limassol', ...IN_CYPRUS, population: 154_000, code: 'PPLA' },
			{ id: 2, name: 'Small', ...IN_CYPRUS, population: 14_999 },
			{ id: 3, name: 'Just enough', ...IN_CYPRUS, population: 15_000 },
			{ id: 4, name: 'A section of a city', ...IN_CYPRUS, population: 80_000, code: 'PPLX' },
			{ id: 5, name: 'Historical', ...IN_CYPRUS, population: 80_000, code: 'PPLH' },
			{ id: 6, name: 'Abandoned', ...IN_CYPRUS, population: 80_000, code: 'PPLQ' },
			{ id: 7, name: 'Destroyed', ...IN_CYPRUS, population: 80_000, code: 'PPLW' },
			{ id: 8, name: 'Capital', ...IN_CYPRUS, population: 200_000, code: 'PPLC' },
		]);

		expect(file.cities.map(([id]) => id)).toEqual([8, 1, 3]);
	});

	it('gives each its id, Russian and local names, place to 0.001°, population and zone, biggest first', async () => {
		const { file } = await build(
			[
				{ id: 146384, name: 'Limassol', lat: 0.51234, lon: 3.45678, population: 154_000 },
				{ id: 146268, name: 'Nicosia', lat: 0.6, lon: 3.1, population: 200_452, code: 'PPLC' },
			],
			[
				{ id: 146268, name: 'Никосия' },
				{ id: 146384, name: 'Lemesos', language: 'el' },
				{ id: 146384, name: 'Лимасол' },
			],
		);

		expect(file).toEqual({
			format: 1,
			cities: [
				[146268, 'Никосия', 'Nicosia', 0.6, 3.1, 200_452, 'CYP'],
				[146384, 'Лимасол', 'Limassol', 0.512, 3.457, 154_000, 'CYP'],
			],
		});
	});

	it("takes GeoNames' Russian name that is in use: preferred, then short, then the shortest; a colloquial one last", async () => {
		const city = (id: number) => ({ id, name: `City ${id}`, ...IN_CYPRUS, population: 100_000 - id });
		const { file } = await build(
			[city(1), city(2), city(3), city(4), city(5)],
			[
				{ id: 1, name: 'Длинное название' },
				{ id: 1, name: 'Предпочтительное название', preferred: true },
				{ id: 1, name: 'Старое', historic: true },
				{ id: 1, name: 'Бывшее', to: '1991' },
				{ id: 2, name: 'Название подлиннее' },
				{ id: 2, name: 'Короткое название', short: true },
				{ id: 3, name: 'Первое длинное' },
				{ id: 3, name: 'Второе' },
				// Murmansk: its very name is marked colloquial, beside nicknames that are too.
				{ id: 4, name: 'Мурманск', colloquial: true },
				{ id: 4, name: 'Столица Арктики', colloquial: true },
				{ id: 5, name: 'Разговорное', colloquial: true, preferred: true },
				{ id: 5, name: 'Обычное название' },
			],
		);

		expect(file.cities.map(([id, ru]) => [id, ru])).toEqual([
			[1, 'Предпочтительное название'],
			[2, 'Короткое название'],
			[3, 'Второе'],
			[4, 'Мурманск'],
			[5, 'Обычное название'],
		]);
	});

	it('drops a qualifier in brackets from a Russian name, and takes a name in Cyrillic over one with Latin letters', async () => {
		const city = (id: number) => ({ id, name: `City ${id}`, ...IN_CYPRUS, population: 100_000 - id });
		const { file } = await build(
			[city(1), city(2), city(3)],
			[
				{ id: 1, name: 'Шерпур (город, Бангладеш)', preferred: true },
				// «Грeнобль» with a Latin «e».
				{ id: 2, name: 'Грeнобль', preferred: true },
				{ id: 2, name: 'Гренобль' },
				{ id: 3, name: 'Монтерía' },
			],
		);

		expect(file.cities.map(([id, ru]) => [id, ru])).toEqual([
			[1, 'Шерпур'],
			[2, 'Гренобль'],
			[3, 'Монтерía'],
		]);
	});

	it("asks Wikidata only for the cities without a Russian name in GeoNames, and takes its label; else the name stays empty", async () => {
		const asked: number[][] = [];
		const { file, report } = await build(
			[
				{ id: 1, name: 'Aalst', ...IN_CYPRUS, population: 80_000 },
				{ id: 2, name: 'Brussels', ...IN_CYPRUS, population: 1_000_000 },
				{ id: 3, name: 'Paju', ...IN_CYPRUS, population: 50_000 },
			],
			[{ id: 2, name: 'Брюссель' }],
			async (ids) => {
				asked.push([...ids]);
				return new Map([[1, 'Алст']]);
			},
		);

		expect(asked).toEqual([[1, 3]]);
		expect(file.cities.map(([id, ru, local]) => [id, ru, local])).toEqual([
			[2, 'Брюссель', 'Brussels'],
			[1, 'Алст', 'Aalst'],
			[3, '', 'Paju'],
		]);
		expect(report).toMatchObject({ russianFromGeoNames: 1, russianFromWikidata: 1, withoutRussian: 1 });
	});

	it("puts each city in its zone by the graph's polygons, a part of a country before the country", async () => {
		const { file } = await build([
			// GeoNames puts these in the recognised country (#6): Kyrenia in CY, Simferopol in UA, Sukhumi in GE.
			{ id: 1, name: 'Kyrenia', lat: 0.5, lon: 2.5, population: 26_701, country: 'CY' },
			{ id: 2, name: 'Nicosia', lat: 0.5, lon: 3.5, population: 200_452, country: 'CY' },
			{ id: 3, name: 'Simferopol', lat: 0.5, lon: 10.3, population: 336_460, country: 'UA' },
			{ id: 4, name: 'Sukhumi', lat: 0.5, lon: 13.5, population: 64_441, country: 'GE' },
			{ id: 5, name: 'Tiraspol', lat: 0.5, lon: 7.5, population: 157_000, country: 'MD' },
			{ id: 6, name: 'Pristina', lat: 0.5, lon: 0.5, population: 161_751, country: 'XK' },
			{ id: 7, name: 'Gaza', lat: 0.5, lon: 16.5, population: 410_000, country: 'PS' },
			{ id: 8, name: 'Akrotiri', lat: 0.5, lon: 4.5, population: 15_500, country: 'GB' },
		]);

		expect(Object.fromEntries(file.cities.map(([, , local, , , , zone]) => [local, zone]))).toEqual({
			Kyrenia: 'NX',
			Nicosia: 'CYP',
			Simferopol: 'CRIMEA',
			Sukhumi: 'ABKHAZIA',
			Tiraspol: 'MDA',
			Pristina: 'RKS',
			Gaza: 'GAZA',
			Akrotiri: 'CYP',
		});
	});

	it("puts a city outside every polygon in its GeoNames country, and leaves it out when that is no zone's", async () => {
		// Far from the squares of zones.osm.
		const away = { lat: 5, lon: 50 };
		const { file, report } = await build([
			{ id: 1, name: 'Ramallah', ...away, population: 38_998, country: 'PS' },
			{ id: 2, name: 'Prizren', ...away, population: 85_119, country: 'XK' },
			{ id: 3, name: 'Nowhere', ...away, population: 20_000, country: 'ZZ' },
			{ id: 4, name: 'Nicosia', lat: 0.5, lon: 3.5, population: 200_452, country: 'CY' },
		]);

		expect(file.cities.map(([, , local, , , , zone]) => [local, zone])).toEqual([
			['Nicosia', 'CYP'],
			['Prizren', 'RKS'],
			['Ramallah', 'PSE'],
		]);
		expect(report).toMatchObject({ cities: 3, zoneByPolygon: 1, zoneByCountry: 2, withoutZone: ['3 Nowhere ZZ'] });
	});
});
