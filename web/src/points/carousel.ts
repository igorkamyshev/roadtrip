// The carousel's link with the map (spec #20 «Экран», «Карусель»): on the narrow screen the current card when it stops,
// the one at its left edge (#85), is the chosen point of interest, which the map goes to, and a point tapped on the map
// scrolls its card there; on the wide screen (#104) a chosen point's card is only shown whole. Which applies is
// src/screen/use-chosen-point.ts's. A card names its point of interest by its key, `data-point`.
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** The carousel's cards of points of interest: the most famous of the ring's, named on the map, counted by `ring result`. */
export const CAROUSEL_POINTS = 12;

/** How long the carousel stays still before its stop counts: a swipe scrolls in many steps, then snaps. */
const STOP_AFTER_MS = 140;

/** The carousel's stops: its scroll handler, and a way to let the scroll a change of its layout makes stop unheard. */
export interface CarouselStops {
	/** Any scroll of the carousel: `onStop` is called once it stops. */
	readonly onScroll: () => void;
	/**
	 * The layout is changing under the carousel, which may scroll it to snap anew: the stop of that scroll, or of
	 * none if it does not come, calls no `onStop`.
	 */
	readonly skipLayoutStop: () => void;
}

/**
 * The carousel's stops: `onStop` is called once it stops, with the key of the current card's point of interest, or
 * undefined for another card (the first one, «и ещё»).
 */
export function useCarouselStops(carousel: RefObject<HTMLElement | null>, onStop: (key: string | undefined) => void): CarouselStops {
	// The latest handler, for the stop that comes after a render.
	const latest = useRef(onStop);
	useLayoutEffect(() => {
		latest.current = onStop;
	});
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	// Whether the stop to come is the layout's own.
	const layouts = useRef(false);
	useEffect(
		() => () => {
			clearTimeout(timer.current);
		},
		[],
	);
	const onScroll = (): void => {
		clearTimeout(timer.current);
		timer.current = setTimeout(() => {
			const element = carousel.current;
			const skipped = layouts.current;
			layouts.current = false;
			if (element !== null && !skipped) {
				latest.current(currentPoint(element));
			}
		}, STOP_AFTER_MS);
	};
	return {
		onScroll,
		// The scroll a layout makes comes within a frame, well before the stop's wait is over: the wait starts now.
		skipLayoutStop: () => {
			layouts.current = true;
			onScroll();
		},
	};
}

/**
 * The key of the point of interest of the card nearest the carousel's left edge, where a card snaps: where the first
 * card stands before any scroll.
 */
function currentPoint(carousel: HTMLElement): string | undefined {
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
	return nearest?.dataset.point;
}

/** Whether the card of the point `key` is the current one: scrolling to it would not stop the carousel. */
export function isCurrentCard(carousel: HTMLElement | null, key: string): boolean {
	return carousel !== null && currentPoint(carousel) === key;
}

/** The card of the point `key` in the carousel, or undefined when the point has none. */
function cardOf(carousel: HTMLElement | null, key: string): Element | undefined {
	return carousel?.querySelector(`[data-point="${key}"]`) ?? undefined;
}

/** Scrolls the card of the point `key` to the carousel's left edge, the current card's place; false when it has none. */
export function scrollToCard(carousel: HTMLElement | null, key: string): boolean {
	const card = cardOf(carousel, key);
	card?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' });
	return card !== undefined;
}

/** Puts the card of the point `key` at the carousel's left edge at once, with no scrolling to see; nothing for no card. */
export function alignCard(carousel: HTMLElement | null, key: string): void {
	cardOf(carousel, key)?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'instant' });
}

/**
 * On the wide screen (#104): scrolls the carousel just enough to show the card of the point `key` whole, by the edge it
 * is nearer, and not at all when it is whole in view; false when the point has no card.
 */
export function showCard(carousel: HTMLElement | null, key: string): boolean {
	const card = cardOf(carousel, key);
	card?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
	return card !== undefined;
}

/** On the wide screen: shows whole the card that holds `focused`, which the browser only scrolls into view itself. */
export function showFocusedCard(carousel: HTMLElement | null, focused: Element): void {
	cardHolding(carousel, focused)?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

/** The carousel's card that holds `inside`, or undefined outside its cards. */
function cardHolding(carousel: HTMLElement | null, inside: Element): HTMLElement | undefined {
	let card: Element | null = inside;
	while (card !== null && card.parentElement !== carousel) {
		card = card.parentElement;
	}
	return card instanceof HTMLElement ? card : undefined;
}

/** A step of the carousel: back, to the left, or forward. */
export type Direction = -1 | 1;

/** The carousel's cards, in order. */
const cardsOf = (carousel: HTMLElement): HTMLElement[] =>
	Array.from(carousel.children).filter((card): card is HTMLElement => card instanceof HTMLElement);

/** How far the carousel's cards stand in from its left edge: where the first one stands before any scroll. */
const insetOf = (carousel: HTMLElement): number => cardsOf(carousel).at(0)?.offsetLeft ?? 0;

/** The carousel's scroll offset, kept between its start and its end. */
export const withinRow = (carousel: HTMLElement, left: number): number =>
	Math.min(Math.max(0, left), carousel.scrollWidth - carousel.clientWidth);

/**
 * The carousel's scroll offset that puts `card` at its left edge, where a card snaps on the narrow screen, or as near
 * as the row's end lets it: a step of the arrows to that card, or the narrow screen's step to a focused card.
 */
export const leftEdgeTarget = (carousel: HTMLElement, card: HTMLElement): number =>
	withinRow(carousel, card.offsetLeft - insetOf(carousel));

/**
 * Where a step of the arrows takes the carousel scrolled to `from` on the wide screen (#99): the part of the row in
 * view, between its edges' padding. Forward, the first card not whole in it comes to the left edge; back, the cards
 * before the first whole one fill it, the last of them at the right edge. Undefined where the row has nothing more
 * that way.
 */
export function pageTarget(carousel: HTMLElement, from: number, direction: Direction): number | undefined {
	const cards = cardsOf(carousel);
	const left = from + insetOf(carousel);
	// oxlint-disable-next-line unicorn/prefer-number-coercion -- a computed length ends in «px», which Number() reads as NaN.
	const right = from + carousel.clientWidth - Number.parseFloat(getComputedStyle(carousel).paddingRight);
	if (direction === 1) {
		const next = cards.find((card) => card.offsetLeft + card.offsetWidth > right + 0.5);
		return next === undefined ? undefined : leftEdgeTarget(carousel, next);
	}
	const before = cards.findLast((card) => card.offsetLeft < left - 0.5);
	return before === undefined ? undefined : withinRow(carousel, before.offsetLeft + before.offsetWidth - (right - from));
}

/**
 * Where a step of the arrows or the wheel takes the carousel scrolled to `from` on the narrow screen (#99): a card, the
 * next one or the one before the current one comes to the left edge. Undefined at the row's end that way.
 */
export function cardTarget(carousel: HTMLElement, from: number, direction: Direction): number | undefined {
	const cards = cardsOf(carousel);
	const start = from + insetOf(carousel);
	// The current card, the one nearest the left edge.
	const distances = cards.map((card) => Math.abs(card.offsetLeft - start));
	const index = distances.indexOf(Math.min(...distances)) + direction;
	const next = index < 0 ? undefined : cards.at(index);
	return next === undefined ? undefined : leftEdgeTarget(carousel, next);
}

/**
 * The card next to the one that holds `focused`, that way, which can take the focus, and what takes it: its name's
 * button, «и ещё» itself. Undefined at the row's end; a card with nothing to focus, as the ring's first card, is
 * passed over.
 */
export function neighbourToFocus(
	carousel: HTMLElement | null,
	focused: Element,
	direction: Direction,
): { readonly card: HTMLElement; readonly target: HTMLElement } | undefined {
	const holding = cardHolding(carousel, focused);
	if (carousel === null || holding === undefined) {
		return undefined;
	}
	const cards = cardsOf(carousel);
	const ordered = direction === 1 ? cards : cards.toReversed();
	for (const card of ordered.slice(ordered.indexOf(holding) + 1)) {
		const target = card.matches('button') ? card : card.querySelector<HTMLElement>('button, a[href]');
		if (target !== null) {
			return { card, target };
		}
	}
	return undefined;
}
