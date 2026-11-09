// The chosen city (spec #20 «Экран», «Карусель»): the card in the carousel's middle, a city tapped on the map or picked
// in the list of all. The map goes to it and names it larger. A new ring chooses none and shows the carousel from its
// start.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { scrollToCard, useCarouselStops } from '../cities/carousel.ts';
import type { City } from '../cities/cities.ts';
import type { MapHandle } from '../map/camera.ts';
import type { ShownRing } from './use-shown-ring.ts';

/** The map comes at least this close to a city picked in the list of all. */
const PICKED_CITY_ZOOM = 8;

export interface ChosenCity {
	/** The chosen city's id; undefined for none. */
	readonly city: number | undefined;
	/** The carousel, whose card in the middle is the chosen city. */
	readonly carousel: RefObject<HTMLDivElement | null>;
	readonly onCarouselScroll: () => void;
	/** A city tapped on the map: its card comes to the carousel's middle; a city with no card opens the list of all. */
	readonly tap: (city: number) => void;
	/** A city picked in the list of all: chosen, and the map comes close to it. */
	readonly pick: (city: City) => void;
}

export function useChosenCity(shown: ShownRing, map: RefObject<MapHandle | null>, openList: () => void): ChosenCity {
	const { requestId, shownCities } = shown;
	// The choice belongs to the request it was made for: a new one starts with none.
	const [choice, setChoice] = useState<{ readonly request: string; readonly city: number | undefined }>({
		request: requestId,
		city: undefined,
	});
	if (choice.request !== requestId) {
		setChoice({ request: requestId, city: undefined });
	}
	const city = choice.request === requestId ? choice.city : undefined;
	const choose = (id: number | undefined): void => {
		setChoice({ request: requestId, city: id });
	};

	const carousel = useRef<HTMLDivElement>(null);
	useEffect(() => {
		carousel.current?.scrollTo({ left: 0 });
	}, [requestId]);
	const onCarouselScroll = useCarouselStops(carousel, (id) => {
		choose(id);
		const stopped = shownCities?.find((candidate) => candidate.id === id);
		if (stopped !== undefined) {
			map.current?.goTo(stopped);
		}
	});

	return {
		city,
		carousel,
		onCarouselScroll,
		tap: (id) => {
			if (!scrollToCard(carousel.current, id)) {
				choose(id);
				openList();
			}
		},
		pick: (picked) => {
			// A city with a card is chosen when the carousel stops at it, which moves the map; another one here, and the
			// map comes close to it.
			if (picked.id === city || !scrollToCard(carousel.current, picked.id)) {
				choose(picked.id);
				map.current?.goTo(picked, PICKED_CITY_ZOOM);
			}
		},
	};
}
