// The chosen city (GLOSSARY «Выбранная точка интереса», spec #20 «Экран», «Карусель»): the city of a card tapped, a city tapped
// on the map or picked in the list of all, and on the narrow screen of the card the carousel stops at. The map goes to
// it and names it larger. A new ring chooses none and shows the carousel from its start.
//
// The rule is the window's size, not the pointer's (#104). On the narrow screen the carousel's current card, at its
// left edge, is the chosen city: a stop chooses, and a card tapped, or a city tapped on the map or picked, is scrolled
// there for its stop to choose it. On the wide screen the row only scrolls, whatever scrolls it, and its stop chooses
// nothing: a card pressed, a city tapped or picked is chosen and the map goes to it at once, and the row moves only to
// show its card whole. A window that turns narrow puts the chosen city's card at the left edge at once, and chooses
// nothing.
import { type FocusEvent, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { alignCard, isCurrentCard, scrollToCard, showCard, showFocusedCard, useCarouselStops } from '../cities/carousel.ts';
import type { City } from '../cities/cities.ts';
import type { MapHandle } from '../map/camera.ts';
import { useMedia } from '../use-media.ts';
import type { ShownRing } from './use-shown-ring.ts';

/** The map comes at least this close to a city picked in the list of all. */
const PICKED_CITY_ZOOM = 8;

/** What chooses a city, which differs between the narrow screen and the wide one. */
interface Choosing {
	/** A city tapped on the map; a city with no card opens the list of all. */
	readonly tap: (city: number) => void;
	/** A city's card tapped, clicked, or pressed with Enter or Space: the map goes to the city at the zoom it has. */
	readonly tapCard: (city: City) => void;
	/** A city picked in the list of all: chosen, and the map comes close to it. */
	readonly pick: (city: City) => void;
}

export interface ChosenCity extends Choosing {
	/** The chosen city's id; undefined for none. */
	readonly city: number | undefined;
	/** The carousel: on the narrow screen its current card, at its left edge, is the chosen city. */
	readonly carousel: RefObject<HTMLDivElement | null>;
	/**
	 * Any scroll of the carousel, a finger's, the wheel's, the focus's or a script's: its stop chooses the current card's
	 * city on the narrow screen, and nothing on the wide one.
	 */
	readonly onCarouselScroll: () => void;
	/** The focus come into the carousel: on the wide screen its card scrolls in whole, its city not chosen. */
	readonly onCarouselFocus: (event: FocusEvent) => void;
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
	const cityOf = (id: number | undefined): City | undefined => shownCities?.find((candidate) => candidate.id === id);

	const carousel = useRef<HTMLDivElement>(null);
	useEffect(() => {
		carousel.current?.scrollTo({ left: 0 });
	}, [requestId]);

	const wide = useMedia('wide');
	// On the narrow screen any stop chooses, the chosen city's card's too: it brings back the map led away from it.
	const stops = useCarouselStops(carousel, (id) => {
		if (!wide) {
			choose(id);
			const stopped = cityOf(id);
			if (stopped !== undefined) {
				map.current?.goTo(stopped);
			}
		}
	});
	// A window that turns narrow puts the chosen city's card at the carousel's left edge at once, where the narrow
	// screen's chosen card stands; the map stays. Without a chosen city or its card the carousel stays where it was, and
	// a window that turns wide leaves everything as it is. The narrow layout snaps the carousel anew, and the stop of
	// that, which would choose, chooses nothing: the city chosen stays, and the map with it.
	useOnNarrowing(wide, () => {
		stops.skipLayoutStop();
		if (city !== undefined) {
			alignCard(carousel.current, city);
		}
	});

	// The way of the window's size when the person chooses.
	const choosing = (): Choosing => {
		const screen = { carousel, map, choose, cityOf, openList };
		return wide ? choosingOnWide(screen) : choosingOnNarrow(screen);
	};
	return {
		city,
		carousel,
		onCarouselScroll: stops.onScroll,
		onCarouselFocus: (event) => {
			if (wide) {
				showFocusedCard(carousel.current, event.target);
			}
		},
		tap: (id) => {
			choosing().tap(id);
		},
		tapCard: (tapped) => {
			choosing().tapCard(tapped);
		},
		pick: (picked) => {
			choosing().pick(picked);
		},
	};
}

/** What the ways of choosing act on. */
interface Screen {
	readonly carousel: RefObject<HTMLDivElement | null>;
	readonly map: RefObject<MapHandle | null>;
	readonly choose: (city: number | undefined) => void;
	readonly cityOf: (city: number) => City | undefined;
	readonly openList: () => void;
}

/** On the narrow screen a city with a card is chosen by the stop at its card, which the carousel scrolls to. */
function choosingOnNarrow({ carousel, map, choose, openList }: Screen): Choosing {
	// A city whose card is not the current one is chosen when the carousel stops at it, which moves the map. A city
	// whose card is the current one, or that has no card, is chosen and the map moved to it at once.
	const chooseAndShow = (place: City, minZoom?: number): void => {
		if (isCurrentCard(carousel.current, place.id) || !scrollToCard(carousel.current, place.id)) {
			choose(place.id);
			map.current?.goTo(place, minZoom);
		}
	};
	return {
		tap: (id) => {
			if (!scrollToCard(carousel.current, id)) {
				choose(id);
				openList();
			}
		},
		tapCard: (tapped) => {
			chooseAndShow(tapped);
		},
		pick: (picked) => {
			// The map comes close to a city with no card.
			chooseAndShow(picked, PICKED_CITY_ZOOM);
		},
	};
}

/** On the wide screen a city is chosen at once, and the map goes to it; the row only shows its card whole (#104). */
function choosingOnWide({ carousel, map, choose, cityOf, openList }: Screen): Choosing {
	return {
		tap: (id) => {
			choose(id);
			const tapped = cityOf(id);
			if (tapped !== undefined && showCard(carousel.current, id)) {
				map.current?.goTo(tapped);
			} else {
				openList();
			}
		},
		tapCard: (tapped) => {
			choose(tapped.id);
			showCard(carousel.current, tapped.id);
			map.current?.goTo(tapped);
		},
		pick: (picked) => {
			choose(picked.id);
			// The map comes close to a city with no card.
			map.current?.goTo(picked, showCard(carousel.current, picked.id) ? undefined : PICKED_CITY_ZOOM);
		},
	};
}

/** Calls `onNarrowing`, with the state at the time, when the window turns narrow, before it paints so. */
function useOnNarrowing(wide: boolean, onNarrowing: () => void): void {
	const narrowing = useEffectEvent(onNarrowing);
	const wasWide = useRef(wide);
	useLayoutEffect(() => {
		if (wasWide.current && !wide) {
			narrowing();
		}
		wasWide.current = wide;
	}, [wide]);
}
