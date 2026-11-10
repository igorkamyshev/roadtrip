// The screen's media queries of src/media.json in React (spec #20 «Экран», #96): whether the window is the wide screen
// or has a mouse now, read with `matchMedia` like any changing source, so a window that crosses the threshold renders
// again and remounts nothing. Only for what the JS does differently: the look is the CSS's (`@media (--wide)`).
import { useSyncExternalStore } from 'react';
import { type MediaName, matchesMedia, mediaQuery } from './media.ts';

interface MediaStore {
	readonly subscribe: (onChange: () => void) => () => void;
	readonly matches: () => boolean;
}

function mediaStore(name: MediaName): MediaStore {
	return {
		subscribe: (onChange) => {
			const list = matchMedia(mediaQuery(name));
			list.addEventListener('change', onChange);
			return () => {
				list.removeEventListener('change', onChange);
			};
		},
		matches: () => matchesMedia(name),
	};
}

/** One store a query, so that a component subscribes once, not at every render. */
const STORES = new Map<MediaName, MediaStore>();

/** Whether the window answers the query of this name now; the component renders again when that changes. */
export function useMedia(name: MediaName): boolean {
	let store = STORES.get(name);
	if (store === undefined) {
		store = mediaStore(name);
		STORES.set(name, store);
	}
	return useSyncExternalStore(store.subscribe, store.matches);
}
