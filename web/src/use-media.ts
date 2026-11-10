// The screen's media queries of src/media.json in React (spec #20 «Экран», #96): whether the window is the wide screen
// or has a mouse now, read with `matchMedia` like any changing source, so a window that crosses the threshold renders
// again and remounts nothing. Only for what the JS does differently: the look is the CSS's (`@media (--wide)`).
import { useSyncExternalStore } from 'react';
import media from './media.json';

/** A query of src/media.json by its name: `wide`, `mouse`. */
export type MediaName = keyof typeof media;

interface MediaStore {
	readonly subscribe: (onChange: () => void) => () => void;
	readonly matches: () => boolean;
}

function mediaStore(query: string): MediaStore {
	return {
		subscribe: (onChange) => {
			const list = matchMedia(query);
			list.addEventListener('change', onChange);
			return () => {
				list.removeEventListener('change', onChange);
			};
		},
		matches: () => matchMedia(query).matches,
	};
}

const STORES: Readonly<Record<MediaName, MediaStore>> = { wide: mediaStore(media.wide), mouse: mediaStore(media.mouse) };

/** Whether the window answers the query of this name now; the component renders again when that changes. */
export function useMedia(name: MediaName): boolean {
	const { subscribe, matches } = STORES[name];
	return useSyncExternalStore(subscribe, matches);
}
