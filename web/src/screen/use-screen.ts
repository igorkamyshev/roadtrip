// The screen's state and what changes it (spec #20 «Экран»): the link's state, the ring shown with its cities, the
// first card's state, how the origin is set, the chosen city, the sheet open, and the map's handle they move. The
// screen (screen.tsx) lays them out.
import { useCallback, useRef, useState, type RefObject } from 'react';
import type { MapHandle } from '../map/camera.ts';
import { useScreenState, type ScreenStateControls } from '../state/use-screen-state.ts';
import { firstCardState } from './first-card-state.ts';
import type { FirstCardState } from './first-card.tsx';
import { useChosenCity, type ChosenCity } from './use-chosen-city.ts';
import { useShownRing, type ShownRing } from './use-shown-ring.ts';
import { useStartMethods, type StartMethods } from './use-start-methods.ts';

export type SheetName = 'start' | 'citizenships' | 'visas' | 'info' | 'cities';

export interface ScreenModel {
	/** The link's state and its changes. */
	readonly state: ScreenStateControls;
	readonly shown: ShownRing;
	readonly card: FirstCardState;
	readonly starts: StartMethods;
	readonly chosen: ChosenCity;
	/** The map's handle: the point under the pin, a city to go to. */
	readonly map: RefObject<MapHandle | null>;
	/** The sheet open; undefined for none. */
	readonly sheet: SheetName | undefined;
	readonly openSheet: (sheet: SheetName) => void;
	readonly closeSheet: () => void;
}

export function useScreen(): ScreenModel {
	const state = useScreenState();
	const shown = useShownRing(state);
	const map = useRef<MapHandle>(null);
	const [sheet, setSheet] = useState<SheetName>();
	const closeSheet = useCallback(() => {
		setSheet(undefined);
	}, []);
	const openList = useCallback(() => {
		setSheet('cities');
	}, []);
	const starts = useStartMethods({ state, analytics: shown.analytics, map, closeSheet });
	const chosen = useChosenCity(shown, map, openList);
	const card = firstCardState({
		origin: state.origin,
		hours: state.hours,
		ring: shown.ring,
		geolocationFailed: starts.geolocationFailed,
		request: shown.requestId,
		cities: shown.shownCities,
	});
	return { state, shown, card, starts, chosen, map, sheet, openSheet: setSheet, closeSheet };
}
