// The places file (spec #154 «Сборка мест», «Формат файла мест»): its rows written and read back, and the fame key
// that puts places and cities in one list.
import { describe, expect, it } from 'vitest';
import {
	cityFame,
	decodePlaces,
	encodePlaces,
	parsePlacesFile,
	type Place,
	PLACE_GROUP,
	PLACE_TYPES,
	placeFame,
} from '../src/places-file.ts';

const lake: Place = {
	qid: 1_029_310,
	ru: 'Бледское озеро',
	local: 'Lake Bled',
	lat: 46.363,
	lon: 14.094,
	sitelinks: 48,
	type: 'lake',
	access: [{ lat: 46.367, lon: 14.105, zone: 'SVN' }],
};
const monastery: Place = {
	qid: 1_074_640,
	ru: 'Манасия',
	local: 'Manasija',
	lat: 44.093,
	lon: 21.464,
	sitelinks: 30,
	type: 'monastery',
	access: [{ lat: 44.092, lon: 21.462, zone: 'SRB' }],
};
/** A place at a border, with a road in each country. */
const caves: Place = {
	qid: 207_337,
	ru: '',
	local: 'Škocjan Caves',
	lat: 45.664,
	lon: 13.989,
	sitelinks: 48,
	type: 'cave',
	access: [
		{ lat: 45.662, lon: 13.993, zone: 'SVN' },
		{ lat: 45.651, lon: 13.901, zone: 'ITA' },
	],
};

describe('the places file', () => {
	it('writes the places in order of Q-id, each Q-id as its difference from the row before’s, the type’s number and the access points flat', () => {
		expect(encodePlaces([monastery, lake, caves])).toEqual({
			format: 1,
			places: [
				[207_337, '', 'Škocjan Caves', 45.664, 13.989, 48, 4, 45.662, 13.993, 'SVN', 45.651, 13.901, 'ITA'],
				[821_973, 'Бледское озеро', 'Lake Bled', 46.363, 14.094, 48, 5, 46.367, 14.105, 'SVN'],
				[45_330, 'Манасия', 'Manasija', 44.093, 21.464, 30, 8, 44.092, 21.462, 'SRB'],
			],
		});
	});

	it('reads them back as JSON gives them, the most famous first and of equal sitelinks the smaller Q-id', () => {
		const json: unknown = JSON.parse(JSON.stringify(encodePlaces([monastery, lake, caves])));

		expect(decodePlaces(parsePlacesFile(json))).toEqual([caves, lake, monastery]);
	});

	it.each([
		['of another format', { format: 2, places: [] }],
		['with a type no number of the 11', { format: 1, places: [[1, '', 'X', 0, 0, 10, 11, 0, 0, 'AAA']] }],
		['with an access point of two values', { format: 1, places: [[1, '', 'X', 0, 0, 10, 3, 0, 0]] }],
		['with a name that is no string', { format: 1, places: [[1, 2, 'X', 0, 0, 10, 3, 0, 0, 'AAA']] }],
	])('is refused %s', (_, json) => {
		expect(() => parsePlacesFile(json)).toThrow(/places file/u);
	});

	it('has the 11 types in the order of their precedence, each of nature or history', () => {
		expect(PLACE_TYPES.map((type) => [type, PLACE_GROUP[type]])).toEqual([
			['national-park', 'nature'],
			['mountain', 'nature'],
			['canyon', 'nature'],
			['waterfall', 'nature'],
			['cave', 'nature'],
			['lake', 'nature'],
			['beach', 'nature'],
			['island', 'nature'],
			['monastery', 'history'],
			['castle', 'history'],
			['ruins', 'history'],
		]);
	});
});

describe('the fame key', () => {
	// Belgrade, 1 273 651 people: 0.7019 · 1 273 651^0.3408 = 84.50 (worked out by hand), between a place of 56
	// sitelinks (84 × 1.5 = 84) and one of 57 (85.5).
	it('puts a place of sitelinks × 1.5 among the cities by 0.7019 · population^0.3408', () => {
		expect(cityFame(1_273_651)).toBeCloseTo(84.5, 2);
		expect(placeFame(56)).toBe(84);
		expect(placeFame(57)).toBe(85.5);
	});
});
