// The map under the screen (src/map/map-view.tsx), a chunk of its own with MapLibre: the phrase, the slider and the
// first card paint without waiting for it. It shows the ring shown, the zones its answer closes, the origin and the
// ring's biggest cities, and tells of a tap on a city.
import { lazy, Suspense, useMemo, type ReactElement } from 'react';
import type { City } from '../cities/cities.ts';
import type { MapCity } from '../map/overlay.ts';
import { CAROUSEL_CITIES } from './carousel.tsx';
import type { ScreenModel } from './use-screen.ts';

const MapView = lazy(async () => ({ default: (await import('../map/map-view.tsx')).MapView }));

/** The ring's cities the map dots, the biggest: a 12-hour ring holds thousands. */
const MAP_CITIES = 250;

export function ScreenMap({ screen }: { readonly screen: ScreenModel }): ReactElement {
	const { state, shown, starts, chosen, map } = screen;
	const { shownCities } = shown;
	const mapCities = useMemo(() => citiesOnMap(shownCities ?? [], chosen.city), [shownCities, chosen.city]);
	// The ring stands in for one being calculated: striped, and the camera stays.
	const striped = shown.ring.isPlaceholderData;
	return (
		<Suspense fallback={null}>
			<MapView
				ref={map}
				origin={state.origin}
				ring={shown.geometry}
				striped={striped}
				fit={striped || shown.geometry === undefined ? undefined : shown.requestId}
				pinning={starts.pinning}
				closed={shown.closed}
				cities={mapCities}
				onCity={chosen.tap}
			/>
		</Suspense>
	);
}

/** The cities the map shows: the biggest of the ring's, named if they have a card, and the chosen one. */
function citiesOnMap(cities: readonly City[], chosen: number | undefined): MapCity[] {
	const shown = cities.slice(0, MAP_CITIES);
	const chosenCity = cities.find((city) => city.id === chosen);
	if (chosenCity !== undefined && !shown.includes(chosenCity)) {
		shown.push(chosenCity);
	}
	return shown.map(({ id, name, lat, lon }, index) => ({
		id,
		name,
		lat,
		lon,
		label: index < CAROUSEL_CITIES || id === chosen,
		chosen: id === chosen,
	}));
}
