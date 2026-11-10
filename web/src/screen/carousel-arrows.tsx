// The carousel with a mouse (spec #20 «Экран», «Карусель»; #99, #113): at any width, the plate ‹ › that steps the row,
// the vertical wheel over the row that scrolls it, and ← → on a card that move the focus to the next one, the row
// following it. On the wide screen a step is the part of the row in view and the wheel scrolls by its turn; on the
// narrow one both go a card at a time. They only scroll the carousel: its stop chooses on the narrow screen and nothing
// on the wide one (use-chosen-city.ts). Without a mouse there is none of it: the plate, the wheel and the keys are the
// browser's.
import { type ReactElement, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cardTarget, type Direction, leftEdgeOf, neighbourToFocus, pageTarget, withinRow } from '../cities/carousel.ts';
import { useMedia } from '../use-media.ts';
import { BackIcon, ForwardIcon } from './icons.tsx';

/** A scroll of the arrows or the wheel stays the row's aim this long after the row last moved, so steps add up. */
const AIM_KEPT_MS = 200;

/** A line of a wheel that turns by lines, in pixels. */
const WHEEL_LINE = 40;

/** Whether the row scrolls at all, and whether it stands at its start or its end. */
interface RowEnds {
	readonly scrolls: boolean;
	readonly atStart: boolean;
	readonly atEnd: boolean;
}

const STILL: RowEnds = { scrolls: false, atStart: true, atEnd: true };

/** What the plate shows and does. */
export interface CarouselArrowsModel extends RowEnds {
	/** With a mouse and a row that scrolls. */
	readonly shown: boolean;
	readonly step: (direction: Direction) => void;
}

/** The carousel's arrows, wheel and keys, on the carousel `carousel`, with a mouse. */
export function useCarouselArrows(carousel: RefObject<HTMLDivElement | null>): CarouselArrowsModel {
	const mouse = useMedia('mouse');
	const wide = useMedia('wide');
	const ends = useRowEnds(carousel, mouse, wide);
	const aim = useRowAim(carousel);
	const step = (direction: Direction): void => {
		const element = carousel.current;
		const target = wide ? pageTarget : cardTarget;
		const left = element === null ? undefined : target(element, aim.from(), direction);
		if (left !== undefined) {
			aim.to(left);
		}
	};
	const wheel = (element: HTMLElement, event: WheelEvent): void => {
		if (wide) {
			aim.to(withinRow(element, aim.from() + wheelPixels(element, event)));
		} else {
			step(Math.sign(event.deltaY) === 1 ? 1 : -1);
		}
	};
	const key = (element: HTMLElement, focused: Element, direction: Direction): boolean => {
		const neighbour = neighbourToFocus(element, focused, direction);
		if (neighbour === undefined) {
			return false;
		}
		// On the wide screen the focus come into a card shows it whole (`onCarouselFocus`); on the narrow one the card
		// comes to the left edge, for the stop there to choose it.
		neighbour.target.focus({ preventScroll: true });
		if (!wide) {
			aim.to(leftEdgeOf(element, neighbour.card));
		}
		return true;
	};
	useMouseOnRow(carousel, mouse, { wheel, key });
	return { ...ends, shown: mouse && ends.scrolls, step };
}

/** The plate ‹ ›: with a mouse, while the row scrolls; an arrow is grey and does nothing at the row's end that way. */
export function CarouselArrows({ arrows }: { readonly arrows: CarouselArrowsModel }): ReactElement | null {
	if (!arrows.shown) {
		return null;
	}
	return (
		<div className="c-arrows" data-testid="carousel-arrows">
			<Arrow
				label="Листать карточки назад"
				off={arrows.atStart}
				onPress={() => {
					arrows.step(-1);
				}}
			>
				<BackIcon />
			</Arrow>
			<Arrow
				label="Листать карточки вперёд"
				off={arrows.atEnd}
				onPress={() => {
					arrows.step(1);
				}}
			>
				<ForwardIcon />
			</Arrow>
		</div>
	);
}

/** An arrow of the plate: out of the order of Tab, and a press leaves the focus where it was. */
function Arrow({
	label,
	off,
	onPress,
	children,
}: {
	readonly label: string;
	readonly off: boolean;
	readonly onPress: () => void;
	readonly children: ReactNode;
}): ReactElement {
	return (
		<button
			type="button"
			tabIndex={-1}
			aria-label={label}
			disabled={off}
			onMouseDown={(event) => {
				event.preventDefault();
			}}
			onClick={onPress}
		>
			{children}
		</button>
	);
}

/**
 * Where the row stands, with a mouse: read when the carousel is seen first and at each change of its size, its cards
 * and its scroll, and when the window crosses the threshold, which changes its cards' widths.
 */
function useRowEnds(carousel: RefObject<HTMLDivElement | null>, on: boolean, wide: boolean): RowEnds {
	const [ends, setEnds] = useState(STILL);
	useEffect(() => {
		const element = carousel.current;
		// Without a mouse the plate is not there whatever the row does (`shown`).
		if (!on || element === null) {
			return;
		}
		const read = (): void => {
			const now = endsOf(element);
			setEnds((was) => (was.scrolls === now.scrolls && was.atStart === now.atStart && was.atEnd === now.atEnd ? was : now));
		};
		// A ResizeObserver tells of the size it finds first too.
		const resizes = new ResizeObserver(read);
		resizes.observe(element);
		const cards = new MutationObserver(read);
		cards.observe(element, { childList: true });
		element.addEventListener('scroll', read, { passive: true });
		return () => {
			resizes.disconnect();
			cards.disconnect();
			element.removeEventListener('scroll', read);
		};
	}, [carousel, on, wide]);
	return ends;
}

/** Whether the row scrolls, and stands at its start or its end, to the pixel. */
function endsOf(element: HTMLElement): RowEnds {
	const end = element.scrollWidth - element.clientWidth;
	return { scrolls: end > 1, atStart: element.scrollLeft <= 1, atEnd: element.scrollLeft >= end - 1 };
}

/**
 * Where the arrows and the wheel aim the row: a smooth scroll to a place, and the place the next one starts from, the
 * last aim while the row is still on its way there, so that steps and turns of the wheel add up.
 */
function useRowAim(carousel: RefObject<HTMLDivElement | null>): { readonly from: () => number; readonly to: (left: number) => void } {
	const aim = useRef<number>(undefined);
	const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
	useEffect(() => {
		const element = carousel.current;
		if (element === null) {
			return;
		}
		const onScroll = (): void => {
			clearTimeout(timer.current);
			timer.current = setTimeout(() => {
				aim.current = undefined;
			}, AIM_KEPT_MS);
		};
		element.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			clearTimeout(timer.current);
			element.removeEventListener('scroll', onScroll);
		};
	}, [carousel]);
	return {
		from: () => aim.current ?? carousel.current?.scrollLeft ?? 0,
		to: (left) => {
			aim.current = left;
			carousel.current?.scrollTo({ left, behavior: 'smooth' });
		},
	};
}

/** A turn of the wheel in pixels, whatever unit it turned by. */
function wheelPixels(element: HTMLElement, event: WheelEvent): number {
	if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
		return event.deltaY * WHEEL_LINE;
	}
	return event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? event.deltaY * element.clientWidth : event.deltaY;
}

/** The arrow keys and the steps they make. */
const KEYS: ReadonlyMap<string, Direction> = new Map([
	['ArrowLeft', -1],
	['ArrowRight', 1],
]);

/** What the mouse's wheel and the arrow keys do on the row; `key` says whether it took the key. */
interface OnRow {
	readonly wheel: (element: HTMLElement, event: WheelEvent) => void;
	readonly key: (element: HTMLElement, focused: Element, direction: Direction) => boolean;
}

/**
 * With a mouse: the vertical wheel over the row, and ← → on a card. Shift with the wheel, a sideways swipe of a
 * trackpad and a pinch (the wheel with Ctrl) stay the browser's, as do the keys with a modifier.
 */
function useMouseOnRow(carousel: RefObject<HTMLDivElement | null>, on: boolean, onRow: OnRow): void {
	const latest = useRef(onRow);
	useLayoutEffect(() => {
		latest.current = onRow;
	});
	useEffect(() => {
		const element = carousel.current;
		if (!on || element === null) {
			return;
		}
		const onWheel = (event: WheelEvent): void => {
			if (event.shiftKey || event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) {
				return;
			}
			event.preventDefault();
			latest.current.wheel(element, event);
		};
		const onKey = (event: KeyboardEvent): void => {
			const direction = KEYS.get(event.key);
			if (
				direction === undefined ||
				event.altKey ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				!(event.target instanceof Element)
			) {
				return;
			}
			if (latest.current.key(element, event.target, direction)) {
				event.preventDefault();
			}
		};
		element.addEventListener('wheel', onWheel, { passive: false });
		element.addEventListener('keydown', onKey);
		return () => {
			element.removeEventListener('wheel', onWheel);
			element.removeEventListener('keydown', onKey);
		};
	}, [carousel, on]);
}
