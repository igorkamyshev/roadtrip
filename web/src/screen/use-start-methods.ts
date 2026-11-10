// How the person sets the origin from the screen (spec #20 «Экран»; `method` of `start set`): geolocation, at «Где я»
// and on a load with no origin; a city found in the search; the pin in the middle of the map. Each closes the sheet
// it was set from.
import { useCallback, useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react';
import type { ScreenAnalytics } from '../analytics/screen-analytics.ts';
import type { City } from '../cities/cities.ts';
import type { MapHandle } from '../map/camera.ts';
import { point, type LatLon } from '../state/point.ts';
import type { ScreenStateControls } from '../state/use-screen-state.ts';
import { GeolocationError, locate } from '../start/geolocation.ts';

export interface StartMethods {
	/** The browser gave no position, the last time it was asked. */
	readonly geolocationFailed: boolean;
	/** «Где я»: the browser's position becomes the origin. */
	readonly locate: () => void;
	/** A city found in the search becomes the origin. */
	readonly startFromCity: (city: City) => void;
	/** The pin mode: the pin in the middle of the map and its panel in place of the carousel. */
	readonly pinning: boolean;
	readonly startPinning: () => void;
	readonly cancelPinning: () => void;
	/** «Старт здесь»: the point under the pin becomes the origin. */
	readonly startHere: () => void;
	/** The origin's slot in the phrase, which has the focus once the pin mode ends, whichever way (#107). */
	readonly startSlot: RefObject<HTMLButtonElement | null>;
}

export interface StartMethodsInput {
	readonly state: ScreenStateControls;
	/** For `geolocation failed`. */
	readonly analytics: ScreenAnalytics;
	/** The map, whose centre is the point under the pin. */
	readonly map: RefObject<MapHandle | null>;
	/** Closes the sheet the origin was set from. */
	readonly closeSheet: () => void;
}

export function useStartMethods({ state, analytics, map, closeSheet }: StartMethodsInput): StartMethods {
	const { setStart } = state;
	const geolocation = useGeolocation({ origin: state.origin, setStart, analytics, closeSheet });
	const [pinning, setPinning] = useState(false);
	const startSlot = useRef<HTMLButtonElement>(null);
	const endPinning = (): void => {
		setPinning(false);
		startSlot.current?.focus();
	};
	return {
		...geolocation,
		startFromCity: (city) => {
			closeSheet();
			setStart({ method: 'search', origin: point(city.lat, city.lon), city });
		},
		pinning,
		startPinning: () => {
			closeSheet();
			setPinning(true);
		},
		cancelPinning: endPinning,
		startHere: () => {
			const center = map.current?.center();
			endPinning();
			if (center !== undefined) {
				setStart({ method: 'pin', origin: center });
			}
		},
		startSlot,
	};
}

interface GeolocationInput {
	readonly origin: LatLon | undefined;
	readonly setStart: ScreenStateControls['setStart'];
	readonly analytics: ScreenAnalytics;
	readonly closeSheet: () => void;
}

/** Geolocation: at «Где я», and on the first visit or any load whose link and saved state have no origin. */
function useGeolocation({ origin, setStart, analytics, closeSheet }: GeolocationInput): Pick<StartMethods, 'geolocationFailed' | 'locate'> {
	const [failed, setFailed] = useState(false);
	const located = useCallback(
		(position: LatLon) => {
			setFailed(false);
			closeSheet();
			setStart({ method: 'geolocation', origin: position });
		},
		[setStart, closeSheet],
	);
	const notLocated = useCallback(
		(error: unknown) => {
			setFailed(true);
			if (error instanceof GeolocationError) {
				analytics.geolocationFailed(error.reason);
			}
		},
		[analytics],
	);
	const locateHere = useCallback(() => {
		locate().then(located, notLocated);
	}, [located, notLocated]);

	// On a load without an origin: where the person is, unless they set an origin while the browser was asking.
	const locatedOnLoad = useEffectEvent((position: LatLon) => {
		if (origin === undefined) {
			located(position);
		}
	});
	const askedOnLoad = useRef(false);
	useEffect(() => {
		if (origin === undefined && !askedOnLoad.current) {
			askedOnLoad.current = true;
			locate().then(locatedOnLoad, notLocated);
		}
	}, [origin, notLocated]);

	return { geolocationFailed: failed, locate: locateHere };
}
