// The carousel's link with the map (spec #20 «Экран», «Карусель»): on the narrow screen the current card when it stops,
// the one at its left edge (#85), is the chosen city, which the map goes to, and a city tapped on the map scrolls its
// card there; on the wide screen (#104) a chosen city's card is only shown whole. Which applies is
// src/screen/use-chosen-city.ts's.
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

/** The card of `city` in the carousel, or undefined when the city has none. */
function cardOf(carousel: HTMLElement | null, city: number): Element | undefined {
	return carousel?.querySelector(`[data-city="${city}"]`) ?? undefined;
}

/** Scrolls the card of `city` to the carousel's left edge, the current card's place; false when the city has no card. */
export function scrollToCard(carousel: HTMLElement | null, city: number): boolean {
	const card = cardOf(carousel, city);
	card?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
	return card !== undefined;
}

/** Puts the card of `city` at the carousel's left edge at once, with no scrolling to see; nothing for no card. */
export function alignCard(carousel: HTMLElement | null, city: number): void {
	cardOf(carousel, city)?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'instant' });
}

/**
 * On the wide screen (#104): scrolls the carousel just enough to show the card of `city` whole, by the edge it is
 * nearer, and not at all when it is whole in view; false when the city has no card.
 */
export function showCard(carousel: HTMLElement | null, city: number): boolean {
	const card = cardOf(carousel, city);
	card?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
	return card !== undefined;
}

/** On the wide screen: shows whole the card that holds `focused`, which the browser only scrolls into view itself. */
export function showFocusedCard(carousel: HTMLElement | null, focused: Element): void {
	let card: Element | null = focused;
	while (card !== null && card.parentElement !== carousel) {
		card = card.parentElement;
	}
	card?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}
