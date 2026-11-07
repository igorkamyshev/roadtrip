// The start points of the comparison with Valhalla and the extracts both engines read for them (spec «Решения
// по тестам», «Сверка с Валхаллой»: Europe, the Caucasus, Turkey, Central Asia, the Americas).
//
// A region is a country and some neighbours, merged into one extract: big enough for long rings, small enough for
// Valhalla to build its tiles in the memory of one machine. Both engines read the same extract, so a ring the
// extract cuts off is cut off for both alike, and the comparison stays fair.

export interface Region {
	readonly id: string;
	/**
	 * The country extracts merged into one: paths under the extract server in Geofabrik's layout, or the URL of a
	 * file elsewhere, for a country the mirror the check last ran on (download.openstreetmap.fr) lacks.
	 */
	readonly extracts: readonly string[];
}

export interface StartPoint {
	readonly id: string;
	readonly name: string;
	readonly region: string;
	readonly lat: number;
	readonly lon: number;
}

export const REGIONS: readonly Region[] = [
	{ id: 'alps', extracts: ['europe/switzerland', 'europe/austria'] },
	{ id: 'iberia', extracts: ['europe/portugal', 'europe/spain'] },
	{ id: 'scandinavia', extracts: ['europe/norway', 'europe/sweden'] },
	{ id: 'ukraine', extracts: ['europe/ukraine'] },
	{ id: 'caucasus-turkey', extracts: ['europe/turkey', 'asia/georgia', 'asia/armenia'] },
	{
		id: 'central-asia',
		// Geofabrik's asia/kazakhstan, asia/uzbekistan and asia/kyrgyzstan, from geo2day's daily extracts.
		extracts: ['https://geo2day.com/asia/kazakhstan.pbf', 'https://geo2day.com/asia/uzbekistan.pbf', 'https://geo2day.com/asia/kyrgyzstan.pbf'],
	},
	{ id: 'mexico', extracts: ['north-america/mexico'] },
	{ id: 'southern-cone', extracts: ['south-america/chile', 'south-america/argentina'] },
	{ id: 'canada-east', extracts: ['north-america/canada/ontario', 'north-america/canada/quebec'] },
];

export const START_POINTS: readonly StartPoint[] = [
	{ id: 'zurich', name: 'Zürich', region: 'alps', lat: 47.3769, lon: 8.5417 },
	{ id: 'innsbruck', name: 'Innsbruck', region: 'alps', lat: 47.2692, lon: 11.4041 },
	{ id: 'vienna', name: 'Vienna', region: 'alps', lat: 48.2082, lon: 16.3738 },
	{ id: 'lisbon', name: 'Lisbon', region: 'iberia', lat: 38.7223, lon: -9.1393 },
	{ id: 'madrid', name: 'Madrid', region: 'iberia', lat: 40.4168, lon: -3.7038 },
	{ id: 'seville', name: 'Seville', region: 'iberia', lat: 37.3891, lon: -5.9845 },
	{ id: 'oslo', name: 'Oslo', region: 'scandinavia', lat: 59.9139, lon: 10.7522 },
	{ id: 'stockholm', name: 'Stockholm', region: 'scandinavia', lat: 59.3293, lon: 18.0686 },
	{ id: 'kyiv', name: 'Kyiv', region: 'ukraine', lat: 50.4501, lon: 30.5234 },
	{ id: 'lviv', name: 'Lviv', region: 'ukraine', lat: 49.8397, lon: 24.0297 },
	{ id: 'tbilisi', name: 'Tbilisi', region: 'caucasus-turkey', lat: 41.7151, lon: 44.8271 },
	{ id: 'yerevan', name: 'Yerevan', region: 'caucasus-turkey', lat: 40.1792, lon: 44.4991 },
	{ id: 'batumi', name: 'Batumi', region: 'caucasus-turkey', lat: 41.6168, lon: 41.6367 },
	{ id: 'istanbul', name: 'Istanbul', region: 'caucasus-turkey', lat: 41.0082, lon: 28.9784 },
	{ id: 'ankara', name: 'Ankara', region: 'caucasus-turkey', lat: 39.9334, lon: 32.8597 },
	{ id: 'erzurum', name: 'Erzurum', region: 'caucasus-turkey', lat: 39.9043, lon: 41.2679 },
	{ id: 'tashkent', name: 'Tashkent', region: 'central-asia', lat: 41.2995, lon: 69.2401 },
	{ id: 'bishkek', name: 'Bishkek', region: 'central-asia', lat: 42.8746, lon: 74.5698 },
	{ id: 'almaty', name: 'Almaty', region: 'central-asia', lat: 43.222, lon: 76.8512 },
	// Not the Zócalo: there the origin snaps to a one-way road whose way on is a street outside our graph, and our
	// engine reaches almost nothing (see the report).
	{ id: 'mexico-city', name: 'Mexico City', region: 'mexico', lat: 19.427, lon: -99.1676 },
	{ id: 'guadalajara', name: 'Guadalajara', region: 'mexico', lat: 20.6597, lon: -103.3496 },
	{ id: 'monterrey', name: 'Monterrey', region: 'mexico', lat: 25.6866, lon: -100.3161 },
	{ id: 'santiago', name: 'Santiago', region: 'southern-cone', lat: -33.4489, lon: -70.6693 },
	{ id: 'mendoza', name: 'Mendoza', region: 'southern-cone', lat: -32.8895, lon: -68.8458 },
	{ id: 'buenos-aires', name: 'Buenos Aires', region: 'southern-cone', lat: -34.6037, lon: -58.3816 },
	{ id: 'toronto', name: 'Toronto', region: 'canada-east', lat: 43.6532, lon: -79.3832 },
	{ id: 'montreal', name: 'Montreal', region: 'canada-east', lat: 45.5017, lon: -73.5673 },
];
