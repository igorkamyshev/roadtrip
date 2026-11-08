// The nearest city of the cities file (spec «Экран»: the origin's label for geolocation, a link and the saved state;
// «Аналитика и ошибки»: `start_city`, `start_city_id` and `start_country`). Distances worked out by hand: a degree of
// latitude is 111 km, a degree of longitude 111 km × cos(latitude).
import { describe, expect, it } from 'vitest';
import type { City } from './cities.ts';
import { nearestCity } from './nearest.ts';

function city(id: number, name: string, lat: number, lon: number, population: number, zone: string): City {
	return { id, name, local: undefined, lat, lon, population, zone };
}

const BELGRADE = city(792680, 'Белград', 44.804, 20.465, 1_273_651, 'SRB');
const PANCEVO = city(787237, 'Панчево', 44.872, 20.642, 76_654, 'SRB');
const NOVI_SAD = city(3194360, 'Нови-Сад', 45.252, 19.837, 215_400, 'SRB');

describe('nearestCity', () => {
	it('is the city closest to the point, whatever its size, with its country', () => {
		// To Pančevo 4 km (0.022° × 111, 0.042° × 78.8); to Belgrade 12 km (0.046° × 111, 0.135° × 78.8).
		const nearest = nearestCity([BELGRADE, NOVI_SAD, PANCEVO], { lat: 44.85, lon: 20.6 });

		expect(nearest).toEqual(PANCEVO);
		expect(nearest?.zone).toBe('SRB');
	});

	it('measures kilometres, not degrees: far north a degree of longitude is short', () => {
		// At 69° N the city 1° east is 40 km away (111 × cos 69°), the one 0.5° north 56 km.
		const east = city(1, 'Восток', 69, 34, 20_000, 'RUS');
		const north = city(2, 'Север', 69.5, 33, 20_000, 'RUS');

		expect(nearestCity([north, east], { lat: 69, lon: 33 })).toEqual(east);
	});

	it('looks across the antimeridian', () => {
		// From 179.9° E: 179.95° W is 0.15° away (16 km), 178.5° E is 1.4° (149 km).
		const west = city(1, 'Запад', -16.8, -179.95, 20_000, 'FJI');
		const east = city(2, 'Восток', -16.8, 178.5, 20_000, 'FJI');

		expect(nearestCity([east, west], { lat: -16.8, lon: 179.9 })).toEqual(west);
	});

	it('is undefined without cities', () => {
		expect(nearestCity([], { lat: 44.8, lon: 20.4 })).toBeUndefined();
	});
});
