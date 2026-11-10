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

/** One store a query of src/media.json, so that a component subscribes once, not at every render. */
const STORES: Readonly<Record<MediaName, MediaStore>> = {
	wide: mediaStore('wide'),
	mouse: mediaStore('mouse'),
	dark: mediaStore('dark'),
	'reduced-motion': mediaStore('reduced-motion'),
};

/** Whether the window answers the query of this name now; the component renders again when that changes. */
export function useMedia(name: MediaName): boolean {
	const store = STORES[name];
	return useSyncExternalStore(store.subscribe, store.matches);
}
