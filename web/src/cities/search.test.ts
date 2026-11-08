// The city search of the sheet «Откуда едем» (spec «Экран»): by the start of the Russian or the local name, case and
// ё aside, up to 8 cities, those whose name starts so first, bigger ones higher.
import { describe, expect, it } from 'vitest';
import type { City } from './cities.ts';
import { searchCities } from './search.ts';

/** A city with the Russian name `name` and, when it differs, the local one. */
function city(id: number, name: string, local: string | undefined, population: number): City {
	return { id, name, local, lat: 0, lon: 0, population, zone: 'SRB' };
}

const names = (cities: readonly City[]) => cities.map((found) => found.name);

const BELGRADE = city(1, 'Белград', 'Belgrade', 1_273_651);
const BELA_CRKVA = city(2, 'Бела-Црква', 'Bela Crkva', 15_000);
const SZEGED = city(3, 'Сегед', 'Szeged', 160_766);
const ILIDZA = city(4, 'Ilidža', undefined, 71_277);

describe('searchCities', () => {
	it('finds the cities whose Russian name starts with the text', () => {
		expect(names(searchCities([BELGRADE, SZEGED, BELA_CRKVA], 'Бел'))).toEqual(['Белград', 'Бела-Црква']);
	});

	it('finds them by the start of the local name too, also of a city without a Russian one', () => {
		expect(names(searchCities([BELGRADE, SZEGED, ILIDZA], 'Sze'))).toEqual(['Сегед']);
		expect(names(searchCities([BELGRADE, SZEGED, ILIDZA], 'Ilid'))).toEqual(['Ilidža']);
	});

	it('minds neither case nor ё, in the name or in the text', () => {
		const cities = [city(5, 'Орёл', 'Orel', 303_169), city(6, 'Пестово', 'Pestovo', 15_000), SZEGED];

		expect(names(searchCities(cities, 'орел'))).toEqual(['Орёл']);
		expect(names(searchCities(cities, 'ОРЁЛ'))).toEqual(['Орёл']);
		expect(names(searchCities(cities, 'пёст'))).toEqual(['Пестово']);
		expect(names(searchCities(cities, 'SZEGED'))).toEqual(['Сегед']);
	});

	it('puts the names that start with the text first, then those with a word that does; bigger cities higher', () => {
		const cities = [
			city(7, 'Великий Новгород', 'Veliky Novgorod', 224_286),
			city(8, 'Нови-Сад', 'Novi Sad', 215_400),
			city(9, 'Херцег-Нови', 'Herceg Novi', 19_536),
			city(10, 'Новосибирск', 'Novosibirsk', 1_612_833),
			city(11, 'Нижний Новгород', 'Nizhny Novgorod', 1_284_164),
		];

		expect(names(searchCities(cities, 'нов'))).toEqual(['Новосибирск', 'Нови-Сад', 'Нижний Новгород', 'Великий Новгород', 'Херцег-Нови']);
		expect(names(searchCities(cities, 'сад'))).toEqual(['Нови-Сад']);
	});

	it('takes a space for a hyphen', () => {
		const cities = [city(8, 'Нови-Сад', 'Novi Sad', 215_400), BELA_CRKVA];

		expect(names(searchCities(cities, 'нови сад'))).toEqual(['Нови-Сад']);
		expect(names(searchCities(cities, 'novi-s'))).toEqual(['Нови-Сад']);
		expect(names(searchCities(cities, 'бела ц'))).toEqual(['Бела-Црква']);
	});

	it('does not find a text in the middle of a word', () => {
		expect(searchCities([BELGRADE, SZEGED], 'град')).toEqual([]);
		expect(searchCities([BELGRADE, SZEGED], 'grade')).toEqual([]);
	});

	it('gives the 8 biggest at most', () => {
		const cities = Array.from({ length: 10 }, (_, index) => city(100 + index, `Сити ${index}`, undefined, 20_000 + index * 1000));

		expect(names(searchCities(cities, 'сити'))).toEqual(['Сити 9', 'Сити 8', 'Сити 7', 'Сити 6', 'Сити 5', 'Сити 4', 'Сити 3', 'Сити 2']);
	});

	it('finds nothing for no text', () => {
		expect(searchCities([BELGRADE, SZEGED], '')).toEqual([]);
		expect(searchCities([BELGRADE, SZEGED], '  ')).toEqual([]);
	});
});
