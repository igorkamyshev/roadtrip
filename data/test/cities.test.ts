// The cities file (spec «Набор данных», «Файл городов»): GeoNames' cities from 15 000 people without sections of
// cities and vanished places, their Russian names from GeoNames or else Wikidata, and their zones by the graph's
// polygons. The inputs are lines in GeoNames' own formats (cities1000.txt, alternateNamesV2.txt) and a double of
// Wikidata; the zones are those of zones.osm (its header has the squares).
import { describe, expect, it } from 'vitest';
import { type CityRow, decodeCities, encodeCities, parseCitiesFile } from '../src/cities-file.ts';
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
	return [id, name, name, '', lat, lon, 'P', code, country, '', '01', '', '', '', population, '', '10', 'Asia/Nicosia', '2026-01-01'].join(
		'\t',
	);
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

const flag = (set: boolean | undefined) => (set === true ? '1' : '');

/** A line of alternateNamesV2.txt: 10 columns separated by tabs, the flags `1` or empty. */
function nameLine({ id, name, language = 'ru', preferred, short, colloquial, historic, to = '' }: AlternateName): string {
	return [alternateNameId++, id, language, name, flag(preferred), flag(short), flag(colloquial), flag(historic), '', to].join('\t');
}

/** The lines of a file, as the build reads them. */
const lines = (values: readonly string[]): AsyncIterable<string> => ReadableStream.from(values);

/** Wikidata with no Russian labels, recording what it is asked. */
function noWikidata(asked: number[][] = []): CitiesSources['wikidataLabels'] {
	return (ids) => {
		asked.push([...ids]);
		return Promise.resolve(new Map());
	};
}

function build(places: readonly Place[], names: readonly AlternateName[] = [], wikidataLabels = noWikidata()) {
	return buildCities({
		cities: lines(places.map((place) => cityLine(place))),
		alternateNames: lines(names.map((name) => nameLine(name))),
		wikidataLabels,
		graph: zones,
	});
}

/**
 * The n-th point of a row inside Cyprus (2°–4°E) and outside Northern Cyprus (2.2°–2.8°E), 0.1° (11 km) apart: no
 * city of a million or fewer holds the next in its limits (9 km for a million), so none is a part of a city.
 */
const inCyprus = (n: number) => ({ lat: 0.5, lon: 2.9 + n * 0.1 });

/** The n-th point of a row far from the squares of zones.osm, 0.1° (11 km) apart. */
const away = (n: number) => ({ lat: 5, lon: 50 + n * 0.1 });

/** A city in Cyprus, the bigger the smaller its id. */
const city = (id: number) => ({ id, name: `City ${id}`, ...inCyprus(id), population: 100_000 - id });

describe('the cities', () => {
	it('holds the places of 15 000 people and more, without sections of cities and vanished places', async () => {
		const { cities } = await build([
			{ id: 1, name: 'Limassol', ...inCyprus(1), population: 154_000, code: 'PPLA' },
			{ id: 2, name: 'Small', ...inCyprus(2), population: 14_999 },
			{ id: 3, name: 'Just enough', ...inCyprus(3), population: 15_000 },
			{ id: 4, name: 'A section of a city', ...inCyprus(4), population: 80_000, code: 'PPLX' },
			{ id: 5, name: 'Historical', ...inCyprus(5), population: 80_000, code: 'PPLH' },
			{ id: 6, name: 'Abandoned', ...inCyprus(6), population: 80_000, code: 'PPLQ' },
			{ id: 7, name: 'Destroyed', ...inCyprus(7), population: 80_000, code: 'PPLW' },
			{ id: 8, name: 'Capital', ...inCyprus(8), population: 200_000, code: 'PPLC' },
		]);

		expect(cities.map(([id]) => id)).toEqual([8, 1, 3]);
	});

	it('gives each its id, Russian and local names, place to 0.001°, population and zone, biggest first', async () => {
		const { cities } = await build(
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

		expect(cities).toEqual([
			[146268, 'Никосия', 'Nicosia', 0.6, 3.1, 200_452, 'CYP'],
			[146384, 'Лимасол', 'Limassol', 0.512, 3.457, 154_000, 'CYP'],
		]);
	});

	it("takes GeoNames' Russian name that is in use: preferred, then short, then the shortest; a colloquial one last", async () => {
		const { cities } = await build(
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

		expect(cities.map(([id, ru]) => [id, ru])).toEqual([
			[1, 'Предпочтительное название'],
			[2, 'Короткое название'],
			[3, 'Второе'],
			[4, 'Мурманск'],
			[5, 'Обычное название'],
		]);
	});

	it('drops a qualifier in brackets from a Russian name, and takes a name in Cyrillic over one with Latin letters', async () => {
		const { cities } = await build(
			[city(1), city(2), city(3)],
			[
				{ id: 1, name: 'Шерпур (город, Бангладеш)', preferred: true },
				// «Грeнобль» with a Latin «e».
				{ id: 2, name: 'Грeнобль', preferred: true },
				{ id: 2, name: 'Гренобль' },
				{ id: 3, name: 'Монтерía' },
			],
		);

		expect(cities.map(([id, ru]) => [id, ru])).toEqual([
			[1, 'Шерпур'],
			[2, 'Гренобль'],
			[3, 'Монтерía'],
		]);
	});

	it('asks Wikidata only for the cities without a Russian name in GeoNames, and takes its label; else the name stays empty', async () => {
		const asked: number[][] = [];
		const { cities, report } = await build(
			[
				{ id: 1, name: 'Aalst', ...inCyprus(1), population: 80_000 },
				{ id: 2, name: 'Brussels', ...inCyprus(2), population: 1_000_000 },
				{ id: 3, name: 'Paju', ...inCyprus(3), population: 50_000 },
			],
			[{ id: 2, name: 'Брюссель' }],
			(ids) => {
				asked.push([...ids]);
				return Promise.resolve(new Map([[1, 'Алст']]));
			},
		);

		expect(asked).toEqual([[1, 3]]);
		expect(cities.map(([id, ru, local]) => [id, ru, local])).toEqual([
			[2, 'Брюссель', 'Brussels'],
			[1, 'Алст', 'Aalst'],
			[3, '', 'Paju'],
		]);
		expect(report).toMatchObject({ russianFromGeoNames: 1, russianFromWikidata: 1, withoutRussian: 1 });
	});

	it("puts each city in its zone by the graph's polygons, a part of a country before the country", async () => {
		const { cities } = await build([
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

		expect(Object.fromEntries(cities.map(([, , local, , , , zone]) => [local, zone]))).toEqual({
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
		const { cities, report } = await build([
			{ id: 1, name: 'Ramallah', ...away(1), population: 38_998, country: 'PS' },
			{ id: 2, name: 'Prizren', ...away(2), population: 85_119, country: 'XK' },
			{ id: 3, name: 'Nowhere', ...away(3), population: 20_000, country: 'ZZ' },
			{ id: 4, name: 'Nicosia', lat: 0.5, lon: 3.5, population: 200_452, country: 'CY' },
		]);

		expect(cities.map(([, , local, , , , zone]) => [local, zone])).toEqual([
			['Nicosia', 'CYP'],
			['Prizren', 'RKS'],
			['Ramallah', 'PSE'],
		]);
		expect(report).toMatchObject({ cities: 3, zoneByPolygon: 1, zoneByCountry: 2, withoutZone: ['3 Nowhere ZZ'] });
	});
});

describe('the parts of a city', () => {
	// Real places of GeoNames; their distances, by hand at 111.2 km a degree of latitude and cos(lat) of that a degree
	// of longitude. A city's limits are 9 km × √(its people in millions): Belgrade's 10.2 km, Sarajevo's 7.5,
	// Moscow's 29.0.
	const serbia = { country: 'RS', code: 'PPLA3' };
	const BELGRADE = { id: 792680, name: 'Belgrade', lat: 44.80401, lon: 20.46513, population: 1_273_651, code: 'PPLC', country: 'RS' };
	const places: Place[] = [
		BELGRADE,
		// 3.2 km from Belgrade.
		{ id: 787607, name: 'Novi Beograd', lat: 44.80556, lon: 20.42417, population: 209_763, ...serbia },
		// 6.9 km.
		{ id: 783920, name: 'Zemun', lat: 44.8458, lon: 20.40116, population: 155_591, ...serbia },
		// 15.8 km and 15.3 km: outside Belgrade's limits.
		{ id: 787237, name: 'Pančevo', lat: 44.87177, lon: 20.64167, population: 76_654, code: 'PPLA2', country: 'RS' },
		{ id: 785615, name: 'Sremčica', lat: 44.67653, lon: 20.39232, population: 23_000, code: 'PPL', country: 'RS' },
		{ id: 3191281, name: 'Sarajevo', lat: 43.84864, lon: 18.35644, population: 696_731, code: 'PPLC', country: 'BA' },
		// 4.4 km from Sarajevo.
		{ id: 3199145, name: 'Ilidža', lat: 43.83148, lon: 18.30697, population: 71_277, code: 'PPLA3', country: 'BA' },
		{ id: 524901, name: 'Moscow', lat: 55.75204, lon: 37.61781, population: 10_381_222, code: 'PPLC', country: 'RU' },
		// 20.3 km from Moscow: a satellite grown into it.
		{ id: 550280, name: 'Khimki', lat: 55.9001, lon: 37.42848, population: 239_967, code: 'PPLA2', country: 'RU' },
	];

	it("leaves out the places within a city's limits that it is three times as big as or more", async () => {
		const { cities } = await build(places);

		expect(cities.map(([, , local]) => local)).toEqual(['Moscow', 'Belgrade', 'Sarajevo', 'Pančevo', 'Sremčica']);
	});

	it('keeps a city within the limits of another that is less than three times as big', async () => {
		// 4.5 km apart, within the bigger's 9 km; 1 000 000 is 2.5 times 400 000, and 3 times 333 334 less 2.
		const { cities } = await build([
			{ id: 1, name: 'Big', lat: 10, lon: 50, population: 1_000_000, country: 'RS' },
			{ id: 2, name: 'Near and big', lat: 10.04, lon: 50, population: 400_000, country: 'RS' },
			{ id: 3, name: 'Near, a third', lat: 9.96, lon: 50, population: 333_334, country: 'RS' },
		]);

		expect(cities.map(([, , local]) => local)).toEqual(['Big', 'Near and big', 'Near, a third']);
	});

	it('keeps a place within the limits of a part only, outside those of its city: a part holds no parts', async () => {
		// A city of a million, 9 km of limits; 8 km east of it a place of 100 000, 2.8 km of limits; 10 km east of the
		// city, 2 km from that one, a place of 20 000. At 10° N a degree of longitude is 109.5 km.
		const { cities, report } = await build([
			{ id: 1, name: 'City', lat: 10, lon: 50, population: 1_000_000, country: 'RS' },
			{ id: 2, name: 'Part', lat: 10, lon: 50.073, population: 100_000, country: 'RS' },
			{ id: 3, name: 'Beyond', lat: 10, lon: 50.0913, population: 20_000, country: 'RS' },
		]);

		expect(cities.map(([, , local]) => local)).toEqual(['City', 'Beyond']);
		expect(report.biggestCityParts).toEqual([{ id: 2, name: 'Part', population: 100_000, city: 'City', km: 8 }]);
	});

	it('reports how many places are parts of a city, and the biggest with their city and distance', async () => {
		const { report } = await build(places);

		expect(report.cityParts).toBe(4);
		expect(report.biggestCityParts).toEqual([
			{ id: 550280, name: 'Khimki', population: 239_967, city: 'Moscow', km: 20.3 },
			{ id: 787607, name: 'Novi Beograd', population: 209_763, city: 'Belgrade', km: 3.2 },
			{ id: 783920, name: 'Zemun', population: 155_591, city: 'Belgrade', km: 6.9 },
			{ id: 3199145, name: 'Ilidža', population: 71_277, city: 'Sarajevo', km: 4.4 },
		]);
	});

	it('names the 20 biggest parts only', async () => {
		// 25 places 1 km from a city of 1 000 000, each of 20 000 people and more.
		const { report } = await build([
			{ id: 1, name: 'City', lat: 10, lon: 50, population: 1_000_000, country: 'RS' },
			...Array.from({ length: 25 }, (_, n) => ({
				id: n + 2,
				name: `Part ${n + 2}`,
				lat: 10.009,
				lon: 50,
				population: 20_000 + n,
				country: 'RS',
			})),
		]);

		expect(report.cityParts).toBe(25);
		expect(report.biggestCityParts.map(({ id }) => id)).toEqual(Array.from({ length: 20 }, (_, n) => 26 - n));
	});
});

describe('the cities file', () => {
	const cities: CityRow[] = [
		[792680, 'Белград', 'Belgrade', 44.804, 20.465, 1_273_651, 'SRB'],
		[3194360, 'Нови-Сад', 'Novi Sad', 45.252, 19.837, 215_400, 'SRB'],
		[787657, 'Ниш', 'Niš', 43.325, 21.903, 250_000, 'SRB'],
	];

	it('holds the cities in order of id, each id as its difference from the one before: they compress far better so', () => {
		expect(encodeCities(cities)).toEqual({
			format: 1,
			cities: [
				[787657, 'Ниш', 'Niš', 43.325, 21.903, 250_000, 'SRB'],
				[5023, 'Белград', 'Belgrade', 44.804, 20.465, 1_273_651, 'SRB'],
				[2401680, 'Нови-Сад', 'Novi Sad', 45.252, 19.837, 215_400, 'SRB'],
			],
		});
	});

	it('reads back the cities with their ids, biggest first', () => {
		expect(decodeCities(parseCitiesFile(JSON.parse(JSON.stringify(encodeCities(cities)))))).toEqual([
			[792680, 'Белград', 'Belgrade', 44.804, 20.465, 1_273_651, 'SRB'],
			[787657, 'Ниш', 'Niš', 43.325, 21.903, 250_000, 'SRB'],
			[3194360, 'Нови-Сад', 'Novi Sad', 45.252, 19.837, 215_400, 'SRB'],
		]);
	});
});
