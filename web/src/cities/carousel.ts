// The carousel's link with the map (spec #20 «Экран», «Карусель»): the current card when it stops, the one at its left
// edge (#85), is the chosen city, which the map goes to; a city tapped on the map scrolls its card there.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** How long the carousel stays still before its stop counts: a swipe scrolls in many steps, then snaps. */
const STOP_AFTER_MS = 140;

/**
 * A scroll handler for the carousel that calls `onStop` once it stops, with the city of the current card, or undefined
 * for another card (the first one, «и ещё»).
 */
export function useCarouselStops(carousel: RefObject<HTMLElement | null>, onStop: (city: number | undefined) => void): () => void {
	// The latest handler, for the stop that comes after a render.
	const latest = useRef(onStop);
	useLayoutEffect(() => {
		latest.current = onStop;
	});
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(
		() => () => {
			clearTimeout(timer.current);
		},
		[],
	);
	return () => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			const element = carousel.current;
			if (element !== null) {
				latest.current(currentCity(element));
			}
		}, STOP_AFTER_MS);
	};
}

/**
 * The city of the card nearest the carousel's left edge, where a card snaps: where the first card stands before any
 * scroll.
 */
function currentCity(carousel: HTMLElement): number | undefined {
	const first = carousel.firstElementChild;
	const start = carousel.scrollLeft + (first instanceof HTMLElement ? first.offsetLeft : 0);
	let nearest: HTMLElement | undefined;
	let distance = Infinity;
	for (const card of carousel.children) {
		if (card instanceof HTMLElement) {
			const from = Math.abs(card.offsetLeft - start);
			if (from < distance) {
				distance = from;
				nearest = card;
			}
		}
	}
	const city = nearest?.dataset.city;
	return city === undefined ? undefined : Number(city);
}

/** Whether the card of `city` is the current one: scrolling to it would not stop the carousel. */
export function isCurrentCard(carousel: HTMLElement | null, city: number): boolean {
	return carousel !== null && currentCity(carousel) === city;
}

/** Scrolls the card of `city` to the carousel's left edge, the current card's place; false when the city has no card. */
export function scrollToCard(carousel: HTMLElement | null, city: number): boolean {
	const card = carousel?.querySelector(`[data-city="${city}"]`);
	card?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
	return card !== null && card !== undefined;
}
