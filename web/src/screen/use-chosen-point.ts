// The chosen point of interest (GLOSSARY «Выбранная точка интереса», spec #20 «Экран», «Карусель»): the point of a card
// tapped, a point tapped on the map or picked in the list of all, and on the narrow screen of the card the carousel
// stops at. The map goes to it and names it larger. A new ring chooses none and shows the carousel from its start.
//
// The rule is the window's size, not the pointer's (#104). On the narrow screen the carousel's current card, at its
// left edge, is the chosen point: a stop chooses, and a card tapped, or a point tapped on the map or picked, is scrolled
// there for its stop to choose it. On the wide screen the row only scrolls, whatever scrolls it, and its stop chooses
// nothing: a card pressed, a point tapped or picked is chosen and the map goes to it at once, and the row moves only to
// show its card whole. A window that turns narrow puts the chosen point's card at the left edge at once, and chooses
// nothing.
import { type FocusEvent, useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { MapHandle } from '../map/camera.ts';
import { alignCard, isCurrentCard, scrollToCard, showCard, showFocusedCard, useCarouselStops } from '../points/carousel.ts';
import type { PointOfInterest } from '../points/point-of-interest.ts';
import { useMedia } from '../use-media.ts';
import type { ShownRing } from './use-shown-ring.ts';

/** The map comes at least this close to a point of interest picked in the list of all. */
const PICKED_POINT_ZOOM = 8;

/** What chooses a point of interest, which differs between the narrow screen and the wide one. */
interface Choosing {
	/** A point tapped on the map, by its key; a point with no card opens the list of all. */
	readonly tap: (key: string) => void;
	/** A point's card tapped, clicked, or pressed with Enter or Space: the map goes to the point at the zoom it has. */
	readonly tapCard: (point: PointOfInterest) => void;
	/** A point picked in the list of all: chosen, and the map comes close to it. */
	readonly pick: (point: PointOfInterest) => void;
}

export interface ChosenPoint extends Choosing {
	/** The chosen point of interest's key; undefined for none. */
	readonly key: string | undefined;
	/** The carousel: on the narrow screen its current card, at its left edge, is the chosen point. */
	readonly carousel: RefObject<HTMLDivElement | null>;
	/**
	 * Any scroll of the carousel, a finger's, the wheel's, the focus's or a script's: its stop chooses the current card's
	 * point on the narrow screen, and nothing on the wide one.
	 */
	readonly onCarouselScroll: () => void;
	/** The focus come into the carousel: on the wide screen its card scrolls in whole, its point not chosen. */
	readonly onCarouselFocus: (event: FocusEvent) => void;
}

export function useChosenPoint(shown: ShownRing, map: RefObject<MapHandle | null>, openList: () => void): ChosenPoint {
	const { requestId, shownPoints } = shown;
	// The choice belongs to the request it was made for: a new one starts with none.
	const [choice, setChoice] = useState<{ readonly request: string; readonly key: string | undefined }>({
		request: requestId,
		key: undefined,
	});
	if (choice.request !== requestId) {
		setChoice({ request: requestId, key: undefined });
	}
	const key = choice.request === requestId ? choice.key : undefined;
	const choose = (chosen: string | undefined): void => {
		setChoice({ request: requestId, key: chosen });
	};
	const pointOf = (chosen: string | undefined): PointOfInterest | undefined => shownPoints?.find((candidate) => candidate.key === chosen);

	const carousel = useRef<HTMLDivElement>(null);
	useEffect(() => {
		carousel.current?.scrollTo({ left: 0 });
	}, [requestId]);

	const wide = useMedia('wide');
	// On the narrow screen any stop chooses, the chosen point's card's too: it brings back the map led away from it.
	const stops = useCarouselStops(carousel, (stoppedAt) => {
		if (!wide) {
			choose(stoppedAt);
			const stopped = pointOf(stoppedAt);
			if (stopped !== undefined) {
				map.current?.goTo(stopped);
			}
		}
	});
	// A window that turns narrow puts the chosen point's card at the carousel's left edge at once, where the narrow
	// screen's chosen card stands; the map stays. Without a chosen point or its card the carousel stays where it was, and
	// a window that turns wide leaves everything as it is. The narrow layout snaps the carousel anew, and the stop of
	// that, which would choose, chooses nothing: the point chosen stays, and the map with it.
	useOnNarrowing(wide, () => {
		stops.skipLayoutStop();
		if (key !== undefined) {
			alignCard(carousel.current, key);
		}
	});

	// The way of the window's size when the person chooses.
	const choosing = (): Choosing => {
		const screen = { carousel, map, choose, pointOf, openList };
		return wide ? choosingOnWide(screen) : choosingOnNarrow(screen);
	};
	return {
		key,
		carousel,
		onCarouselScroll: stops.onScroll,
		onCarouselFocus: (event) => {
			if (wide) {
				showFocusedCard(carousel.current, event.target);
			}
		},
		tap: (tapped) => {
			choosing().tap(tapped);
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
	readonly choose: (key: string | undefined) => void;
	readonly pointOf: (key: string) => PointOfInterest | undefined;
	readonly openList: () => void;
}

/** On the narrow screen a point with a card is chosen by the stop at its card, which the carousel scrolls to. */
function choosingOnNarrow({ carousel, map, choose, openList }: Screen): Choosing {
	// A point whose card is not the current one is chosen when the carousel stops at it, which moves the map. A point
	// whose card is the current one, or that has no card, is chosen and the map moved to it at once.
	const chooseAndShow = (point: PointOfInterest, minZoom?: number): void => {
		if (isCurrentCard(carousel.current, point.key) || !scrollToCard(carousel.current, point.key)) {
			choose(point.key);
			map.current?.goTo(point, minZoom);
		}
	};
	return {
		tap: (key) => {
			if (!scrollToCard(carousel.current, key)) {
				choose(key);
				openList();
			}
		},
		tapCard: (tapped) => {
			chooseAndShow(tapped);
		},
		pick: (picked) => {
			// The map comes close to a point with no card.
			chooseAndShow(picked, PICKED_POINT_ZOOM);
		},
	};
}

/** On the wide screen a point is chosen at once, and the map goes to it; the row only shows its card whole (#104). */
function choosingOnWide({ carousel, map, choose, pointOf, openList }: Screen): Choosing {
	return {
		tap: (key) => {
			choose(key);
			const tapped = pointOf(key);
			if (tapped !== undefined && showCard(carousel.current, key)) {
				map.current?.goTo(tapped);
			} else {
				openList();
			}
		},
		tapCard: (tapped) => {
			choose(tapped.key);
			showCard(carousel.current, tapped.key);
			map.current?.goTo(tapped);
		},
		pick: (picked) => {
			choose(picked.key);
			// The map comes close to a point with no card.
			map.current?.goTo(picked, showCard(carousel.current, picked.key) ? undefined : PICKED_POINT_ZOOM);
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
