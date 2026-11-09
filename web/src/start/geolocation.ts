// Where the person is, from the browser (spec #20 «Экран»: geolocation on the first visit and «Где я»). The screen
// sends `geolocation failed` with the reason.
import { point, type LatLon } from '../state/point.ts';

/** Why the browser gave no position: the reasons of `geolocation failed`. */
export type GeolocationFailure = 'denied' | 'unavailable' | 'timeout';

export class GeolocationError extends Error {
	override readonly name = 'GeolocationError';

	constructor(readonly reason: GeolocationFailure) {
		super(`geolocation failed: ${reason}`);
	}
}

const TIMEOUT_MS = 15_000;
/** A position up to 10 minutes old is good enough for a ring of hours. */
const MAXIMUM_AGE_MS = 600_000;

/** The person's position to 5 decimals; rejects with a `GeolocationError`. */
export function locate(): Promise<LatLon> {
	return new Promise((resolve, reject) => {
		if (!('geolocation' in navigator)) {
			reject(new GeolocationError('unavailable'));
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) => {
				resolve(point(position.coords.latitude, position.coords.longitude));
			},
			(error) => {
				const reason = error.code === error.PERMISSION_DENIED ? 'denied' : error.code === error.TIMEOUT ? 'timeout' : 'unavailable';
				reject(new GeolocationError(reason));
			},
			{ timeout: TIMEOUT_MS, maximumAge: MAXIMUM_AGE_MS },
		);
	});
}
