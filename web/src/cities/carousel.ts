// The carousel's link with the map (spec #20 «Экран», «Карусель»): the card in its middle when it stops is the chosen
// city, which the map goes to; a city tapped on the map scrolls its card into the middle.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** How long the carousel stays still before its stop counts: a swipe scrolls in many steps, then snaps. */
const STOP_AFTER_MS = 140;

/**
 * A scroll handler for the carousel that calls `onStop` once it stops, with the city of the card in its middle, or
 * undefined for another card (the first one, «и ещё»).
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
				latest.current(cityInTheMiddle(element));
			}
		}, STOP_AFTER_MS);
	};
}

function cityInTheMiddle(carousel: HTMLElement): number | undefined {
	const middle = carousel.scrollLeft + carousel.clientWidth / 2;
	let nearest: HTMLElement | undefined;
	let distance = Infinity;
	for (const card of carousel.children) {
		if (card instanceof HTMLElement) {
			const from = Math.abs(card.offsetLeft + card.offsetWidth / 2 - middle);
			if (from < distance) {
				distance = from;
				nearest = card;
			}
		}
	}
	const city = nearest?.dataset.city;
	return city === undefined ? undefined : Number(city);
}

/** Scrolls the card of `city` into the carousel's middle; false when the city has no card. */
export function scrollToCard(carousel: HTMLElement | null, city: number): boolean {
	const card = carousel?.querySelector(`[data-city="${city}"]`);
	card?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
	return card !== null && card !== undefined;
}
