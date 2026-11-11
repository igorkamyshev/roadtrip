// The map under the screen (src/map/map-view.tsx), a chunk of its own with MapLibre: the phrase, the slider and the
// first card paint without waiting for it. It shows the ring shown, the zones its answer closes, the origin and the
// ring's most famous points of interest, and tells of a tap on one.
import { PLACE_GROUP } from 'data/places-file';
import { lazy, Suspense, useMemo, type ReactElement } from 'react';
import type { FreeArea } from '../map/camera.ts';
import type { MapPoint } from '../map/overlay.ts';
import type { PointOfInterest } from '../points/point-of-interest.ts';
import { CAROUSEL_POINTS } from './carousel.tsx';
import type { ScreenModel } from './use-screen.ts';

const MapView = lazy(async () => ({ default: (await import('../map/map-view.tsx')).MapView }));

/** The ring's points of interest the map dots, the most famous: a ring of the last hour holds thousands. */
const MAP_POINTS = 250;

/** The map under the screen; `freeArea` is the part of it no panel covers on the wide screen (screen.tsx). */
export function ScreenMap({ screen, freeArea }: { readonly screen: ScreenModel; readonly freeArea: FreeArea }): ReactElement {
	const { state, shown, starts, chosen, map } = screen;
	const { shownPoints } = shown;
	const mapPoints = useMemo(() => pointsOnMap(shownPoints ?? [], chosen.key), [shownPoints, chosen.key]);
	// The ring stands in for one being calculated: striped, and the camera stays.
	const striped = shown.ring.isPlaceholderData;
	return (
		<Suspense fallback={null}>
			<MapView
				ref={map}
				origin={state.origin}
				ring={shown.geometry}
				striped={striped}
				camera={{ fit: striped || shown.geometry === undefined ? undefined : shown.requestId, freeArea }}
				pinning={starts.pinning}
				closed={shown.closed}
				points={mapPoints}
				onPoint={chosen.tap}
			/>
		</Suspense>
	);
}

/**
 * The points of interest the map shows: the most famous of the ring's, named if they have a card, and the chosen one;
 * a place with its group, for its diamond's colour.
 */
function pointsOnMap(points: readonly PointOfInterest[], chosen: string | undefined): MapPoint[] {
	const shown = points.slice(0, MAP_POINTS);
	const chosenPoint = points.find((point) => point.key === chosen);
	if (chosenPoint !== undefined && !shown.includes(chosenPoint)) {
		shown.push(chosenPoint);
	}
	return shown.map((point, index) => ({
		key: point.key,
		name: point.name,
		lat: point.lat,
		lon: point.lon,
		label: index < CAROUSEL_POINTS || point.key === chosen,
		chosen: point.key === chosen,
		group: point.kind === 'place' ? PLACE_GROUP[point.place.type] : undefined,
	}));
}
