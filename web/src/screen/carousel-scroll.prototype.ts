// PROTOTYPE, never merged (#99): the carousel's box, where an arrow's step goes, and the wheel, the keys ← → and the
// drag with the mouse; the controls are carousel-arrows.prototype.tsx's, which variant does what
// wide-carousel.prototype.tsx's.
import { useEffect, useState, type RefObject } from 'react';

const noCleanup = (): void => {};

/** A computed length in px; 0 for `normal` and the like. */
function px(value: string): number {
	const length = Number(value.replace('px', ''));
	return Number.isNaN(length) ? 0 : length;
}

export interface Geometry {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
	readonly padLeft: number;
	readonly padRight: number;
	readonly padTop: number;
	readonly padBottom: number;
	readonly scroll: number;
	readonly max: number;
	readonly client: number;
	/** The right end and the top of the slider's row on the wide screen, which B's plate must not cover. */
	readonly sliderRight: number;
	readonly sliderTop: number;
}

function measure(element: HTMLElement): Geometry {
	const box = element.getBoundingClientRect();
	const style = getComputedStyle(element);
	const slider = document.querySelector('.ws')?.getBoundingClientRect();
	return {
		left: box.left,
		right: box.right,
		top: box.top,
		bottom: box.bottom,
		padLeft: px(style.paddingLeft),
		padRight: px(style.paddingRight),
		padTop: px(style.paddingTop),
		padBottom: px(style.paddingBottom),
		scroll: element.scrollLeft,
		max: element.scrollWidth - element.clientWidth,
		client: element.clientWidth,
		sliderRight: slider?.right ?? 0,
		sliderTop: slider?.top ?? box.top,
	};
}

export function useGeometry(carousel: RefObject<HTMLElement | null>): Geometry | undefined {
	const [geometry, setGeometry] = useState<Geometry>();
	useEffect(() => {
		const element = carousel.current;
		if (element === null) {
			return noCleanup;
		}
		const update = (): void => {
			const next = measure(element);
			setGeometry((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
		};
		update();
		element.addEventListener('scroll', update, { passive: true });
		addEventListener('resize', update);
		const resized = new ResizeObserver(update);
		resized.observe(element);
		const changed = new MutationObserver(update);
		changed.observe(element, { childList: true, subtree: true });
		// The slider's row comes and goes, and its tab changes its width.
		changed.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
		return () => {
			element.removeEventListener('scroll', update);
			removeEventListener('resize', update);
			resized.disconnect();
			changed.disconnect();
		};
	}, [carousel]);
	return geometry;
}

interface CardPlace {
	/** The scroll that brings the card to the row's start. */
	readonly at: number;
	readonly width: number;
}

function cardPlaces(element: HTMLElement): CardPlace[] {
	const cards = [...element.children].filter((card): card is HTMLElement => card instanceof HTMLElement);
	const origin = cards[0]?.offsetLeft ?? 0;
	return cards.map((card) => ({ at: card.offsetLeft - origin, width: card.offsetWidth }));
}

/** The visible part of the row, between its paddings, and the gap between cards. */
function view(element: HTMLElement): { readonly width: number; readonly gap: number } {
	const style = getComputedStyle(element);
	return { width: element.clientWidth - px(style.paddingLeft) - px(style.paddingRight), gap: px(style.columnGap) };
}

/** Forward: the next card to the row's start, or with `page` the first card not wholly seen. */
function forward(element: HTMLElement, page: boolean): number | undefined {
	const now = element.scrollLeft;
	const places = cardPlaces(element);
	const paged = page ? places.find((card) => card.at + card.width - now > view(element).width + 1)?.at : undefined;
	return paged !== undefined && paged > now + 1 ? paged : places.find((card) => card.at > now + 1)?.at;
}

/** Back: the card before the first one to the row's start, or with `page` as many as fill the visible part. */
function back(element: HTMLElement, page: boolean): number | undefined {
	const now = element.scrollLeft;
	const places = cardPlaces(element);
	const { width, gap } = view(element);
	const paged = page ? places.find((card) => card.at >= now - width - gap - 1)?.at : undefined;
	return paged !== undefined && paged < now - 1 ? paged : places.findLast((card) => card.at < now - 1)?.at;
}

function stepTarget(element: HTMLElement, direction: number, page: boolean): number {
	const max = element.scrollWidth - element.clientWidth;
	const target = direction > 0 ? (forward(element, page) ?? max) : (back(element, page) ?? 0);
	return Math.min(Math.max(target, 0), max);
}

export function step(element: HTMLElement | null, direction: number, page: boolean): void {
	element?.scrollTo({ left: stepTarget(element, direction, page), behavior: 'smooth' });
}

/** Snapping off while the wheel, the drag or the scrollbar moves the row, back on once it rests. */
export function freeScroll(element: HTMLElement): () => void {
	element.style.scrollSnapType = 'none';
	return () => {
		element.style.scrollSnapType = '';
	};
}

/**
 * The wheel scrolls the row: on the wide screen freely, by its own distance; on the narrow one a card a turn, since
 * there a stop chooses the card at the left edge. Shift + wheel and a trackpad's sideways swipe stay the browser's.
 */
export function useWheel(carousel: RefObject<HTMLElement | null>, enabled: boolean, wide: boolean): void {
	useEffect(() => {
		const element = carousel.current;
		if (element === null || !enabled) {
			return noCleanup;
		}
		let last = 0;
		let rest: ReturnType<typeof setTimeout> | undefined;
		const onWheel = (event: WheelEvent): void => {
			if (event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) {
				return;
			}
			event.preventDefault();
			if (!wide) {
				if (event.timeStamp - last > 300) {
					last = event.timeStamp;
					step(element, Math.sign(event.deltaY), false);
				}
				return;
			}
			const snapBack = freeScroll(element);
			element.scrollLeft += event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 40 : 1);
			clearTimeout(rest);
			rest = setTimeout(snapBack, 200);
		};
		element.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			element.removeEventListener('wheel', onWheel);
			clearTimeout(rest);
		};
	}, [carousel, enabled, wide]);
}

type Listeners = Record<string, (event: Event) => void>;

/** Listeners on the row while `enabled`; a click's in its capture, before a card's button takes it. */
function useRowListeners(carousel: RefObject<HTMLElement | null>, enabled: boolean, make: (row: HTMLElement) => Listeners): void {
	useEffect(() => {
		const element = carousel.current;
		if (element === null || !enabled) {
			return noCleanup;
		}
		const listeners = Object.entries(make(element));
		for (const [type, listener] of listeners) {
			element.addEventListener(type, listener, type === 'click');
		}
		return () => {
			for (const [type, listener] of listeners) {
				element.removeEventListener(type, listener, type === 'click');
			}
		};
	}, [carousel, enabled, make]);
}

/** ← and → on a card's button take the focus to the card before or after it, which comes into view. */
function keyListeners(element: HTMLElement): Listeners {
	return {
		keydown: (event) => {
			const by = event instanceof KeyboardEvent ? { ArrowRight: 1, ArrowLeft: -1 }[event.key] : undefined;
			const card = event.target instanceof Element ? event.target.closest('.c-car > *') : null;
			const cards = [...element.children];
			const next = by === undefined || card === null ? undefined : cards[cards.indexOf(card) + by]?.querySelector<HTMLElement>('button, a');
			if (next) {
				event.preventDefault();
				next.focus();
			}
		},
	};
}

export function useArrowKeys(carousel: RefObject<HTMLElement | null>, enabled: boolean): void {
	useRowListeners(carousel, enabled, keyListeners);
}

/** C's listeners on the row: a drag with the mouse scrolls it; a drag of more than 6 px is no click. */
function dragListeners(element: HTMLElement): Listeners {
	let start: { readonly x: number; readonly scroll: number; readonly pointer: number } | undefined;
	let dragged = false;
	let snapBack = noCleanup;
	const up = (): void => {
		start = undefined;
		snapBack();
		element.classList.remove('pc-dragging');
	};
	return {
		pointerdown: (event) => {
			if (event instanceof PointerEvent && event.pointerType === 'mouse' && event.button === 0) {
				start = { x: event.clientX, scroll: element.scrollLeft, pointer: event.pointerId };
				dragged = false;
			}
		},
		pointermove: (event) => {
			const shift = start !== undefined && event instanceof PointerEvent ? event.clientX - start.x : 0;
			if (start === undefined || (!dragged && Math.abs(shift) < 6)) {
				return;
			}
			if (!dragged) {
				dragged = true;
				element.setPointerCapture(start.pointer);
				snapBack = freeScroll(element);
				element.classList.add('pc-dragging');
			}
			element.scrollLeft = start.scroll - shift;
		},
		pointerup: up,
		pointercancel: up,
		click: (event) => {
			if (dragged) {
				event.preventDefault();
				event.stopPropagation();
				dragged = false;
			}
		},
		dragstart: (event) => {
			event.preventDefault();
		},
	};
}

export function useDrag(carousel: RefObject<HTMLElement | null>, enabled: boolean): void {
	useRowListeners(carousel, enabled, dragListeners);
}
