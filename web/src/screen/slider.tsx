// The slider (spec #20 «Экран», «Ползунок»; #83, #97, #140): the hours 1…MAX_HOURS, then the days 2…MAX_DAYS. On the
// narrow screen a column at the right edge of the map, on the wide one a row at the bottom left over the carousel
// (styles.css). It is in one unit at a time, the other folded into a tab: in hours a cell an hour, 1 at the bottom or
// the left, with «дни ↑» over them or «дни →» right of them; in days a cell a day, 2 at the bottom or the left, with
// «часы ↓» under them or «← часы» left of them. A cell is a ring, N − 1 to N h or D − 1 to D days, and the chosen one
// is blue. While the slider is dragged the cell under the pointer, or the tab, is chosen on the screen only; the new
// cell is committed when it is let go (a key commits at once), so a drag asks for one ring, not one per cell it passed,
// and a tap on a cell or the tab chooses it. The slider turns to the other unit only once that is committed, never
// under the finger. The cells whose rings are in memory are light green. Here the screen departs from the prototype's
// track and thumb.
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type RefObject } from 'react';
import { HOURS_PER_DAY, MAX_HOURS, SLIDER_CELLS } from 'worker/api';
import { useMedia } from '../use-media.ts';
import { daysWord, hoursShort, hoursSpan, isDay } from './copy.ts';

declare module 'react' {
	interface CSSProperties {
		/** The blue block's place among the cells (`.sl-chosen` in styles.css): how many, and the chosen one's from 0. */
		'--cells'?: number;
		'--chosen'?: number;
	}
}

export interface SliderProps {
	/** The chosen cell by its upper bound in hours (worker/api's `SLIDER_CELLS`). */
	readonly value: number;
	readonly onCommit: (hours: number) => void;
	readonly cached: ReadonlySet<number>;
}

const KEYS: Readonly<Partial<Record<string, number>>> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };

/**
 * A unit of the slider: its cells from the first, and its tab, which chooses the other unit's nearest cell, labelled
 * for the column of the narrow screen and the row of the wide one.
 */
interface Unit {
	readonly cells: readonly number[];
	readonly tab: { readonly hours: number; readonly column: string; readonly row: string };
}

const HOURS: Unit = {
	cells: SLIDER_CELLS.filter((hours) => !isDay(hours)),
	tab: { hours: SLIDER_CELLS[MAX_HOURS], column: 'дни ↑', row: 'дни →' },
};
const DAYS: Unit = {
	cells: SLIDER_CELLS.filter((hours) => isDay(hours)),
	tab: { hours: MAX_HOURS, column: 'часы ↓', row: '← часы' },
};

export function Slider({ value, onCommit, cached }: SliderProps): ReactElement {
	const inDays = isDay(value);
	const unit = inDays ? DAYS : HOURS;
	const row = useMedia('wide');
	const column = useRef<HTMLDivElement>(null);
	const { live, handlers } = useDrag({ column, unit, inDays, row }, value, onCommit);
	const shown = live ?? value;
	const onKeyDown = (event: KeyboardEvent): void => {
		const step = KEYS[event.key];
		if (step === undefined) {
			return;
		}
		event.preventDefault();
		const at = Math.min(SLIDER_CELLS.length - 1, Math.max(0, SLIDER_CELLS.indexOf(value) + step));
		if (SLIDER_CELLS[at] !== value) {
			onCommit(SLIDER_CELLS[at]);
		}
	};
	const tab = (
		<span className={shown === unit.tab.hours ? 'sl-tab on' : 'sl-tab'} data-tab={unit.tab.hours}>
			{row ? unit.tab.row : unit.tab.column}
		</span>
	);

	return (
		<div
			className="sl"
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a column of cells, the chosen one blue and those of the rings in memory green, with a tab for the other unit, which a range input does not draw; it has the slider's role, keys and values
			role="slider"
			tabIndex={0}
			aria-label="Время в пути"
			aria-orientation={row ? 'horizontal' : 'vertical'}
			aria-valuemin={SLIDER_CELLS[0]}
			aria-valuemax={SLIDER_CELLS.at(-1)}
			aria-valuenow={shown}
			aria-valuetext={hoursShort(shown)}
			onKeyDown={onKeyDown}
			{...handlers}
		>
			{inDays ? null : tab}
			<Panel column={column} cells={unit.cells} shown={shown} cached={cached} />
			{inDays ? tab : null}
		</div>
	);
}

/**
 * The panel of the unit's cells, the first at the bottom of the column or the left of the row (styles.css), the chosen
 * one on the blue block.
 */
function Panel({
	column,
	cells,
	shown,
	cached,
}: {
	readonly column: RefObject<HTMLDivElement | null>;
	readonly cells: readonly number[];
	readonly shown: number;
	readonly cached: ReadonlySet<number>;
}): ReactElement {
	const count = cells.length;
	const chosen = cells.indexOf(shown);
	return (
		<div className="sl-panel" data-testid="slider-panel">
			<div className="sl-cells" ref={column}>
				{/* The blue block under the chosen cell: in the first one, moved by a cell and a gap for each before it. */}
				{chosen === -1 ? null : <div className="sl-chosen" style={{ '--cells': count, '--chosen': chosen }} />}
				{cells.toReversed().map((hours) => (
					<span
						key={hours}
						className={hours === shown ? 'sl-cell on' : 'sl-cell'}
						data-hours={hours}
						data-day={isDay(hours) || undefined}
						data-cached={cached.has(hours) || undefined}
					>
						<CellLabel hours={hours} chosen={hours === shown} />
					</span>
				))}
			</div>
		</div>
	);
}

/** N or D, and on the chosen cell its span: «6–7», or «2–3» over a smaller «дня». */
function CellLabel({ hours, chosen }: { readonly hours: number; readonly chosen: boolean }): ReactElement {
	if (!chosen) {
		return <b>{isDay(hours) ? hours / HOURS_PER_DAY : hours}</b>;
	}
	return isDay(hours) ? (
		<b>
			{hoursSpan(hours)}
			<small>{daysWord(hours)}</small>
		</b>
	) : (
		<b>{hoursSpan(hours)}</b>
	);
}

interface Drag {
	/**
	 * The cell under the pointer while the slider is dragged, and the one it was let go at until the screen's value
	 * moves (the link catches up a render later); undefined otherwise.
	 */
	readonly live: number | undefined;
	readonly handlers: {
		readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
		readonly onPointerMove: (event: PointerEvent) => void;
		readonly onPointerUp: (event: PointerEvent) => void;
		readonly onPointerCancel: () => void;
	};
}

/** The cell the pointer chose, and the value when it was let go: until the value moves, the slider keeps showing it. */
interface Held {
	readonly hours: number;
	readonly letGoAt?: number;
}

/**
 * Where the pointer is along the slider: how far along the cells from the first one's outer edge, as a share of their
 * length, and whether it is past the panel's edge on the tab's side: over the column's top or right of the row in
 * hours, under the column's bottom or left of the row in days.
 */
function pointerAlong(
	pointer: { readonly clientX: number; readonly clientY: number },
	{ cells, panel }: { readonly cells: DOMRect; readonly panel: DOMRect },
	{ inDays, row }: { readonly inDays: boolean; readonly row: boolean },
): { share: number; pastTab: boolean } {
	if (row) {
		return {
			share: (pointer.clientX - cells.left) / cells.width,
			pastTab: inDays ? pointer.clientX < panel.left : pointer.clientX > panel.right,
		};
	}
	return {
		share: (cells.bottom - pointer.clientY) / cells.height,
		pastTab: inDays ? pointer.clientY > panel.bottom : pointer.clientY < panel.top,
	};
}

/**
 * A drag along the column or the row: the cell under the pointer is chosen, or the tab past the panel's edge on the
 * tab's side (the panel's padding is its end cell's), and committed when the pointer is let go.
 */
function useDrag(
	{
		column,
		unit,
		inDays,
		row,
	}: { readonly column: RefObject<HTMLDivElement | null>; readonly unit: Unit; readonly inDays: boolean; readonly row: boolean },
	value: number,
	onCommit: (hours: number) => void,
): Drag {
	const [held, setHeld] = useState<Held>();
	if (held?.letGoAt !== undefined && held.letGoAt !== value) {
		// The value has caught up with the cell let go: the slider shows it again, without a render of the old one between.
		setHeld(undefined);
	}
	const dragging = held !== undefined && held.letGoAt === undefined;
	const hoursAt = (event: PointerEvent): number => {
		const cells = column.current?.getBoundingClientRect();
		const panel = column.current?.parentElement?.getBoundingClientRect();
		if (cells === undefined || panel === undefined || cells.height === 0 || cells.width === 0) {
			return value;
		}
		const { share, pastTab } = pointerAlong(event, { cells, panel }, { inDays, row });
		if (pastTab) {
			return unit.tab.hours;
		}
		// The cells from the first, the gaps split between them; past the other end, the end cell.
		const index = Math.floor(share * unit.cells.length);
		return unit.cells[Math.min(unit.cells.length - 1, Math.max(0, index))];
	};
	const handlers = {
		onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			setHeld({ hours: hoursAt(event) });
		},
		onPointerMove: (event: PointerEvent) => {
			if (dragging) {
				setHeld({ hours: hoursAt(event) });
			}
		},
		onPointerUp: (event: PointerEvent) => {
			if (!dragging) {
				return;
			}
			const hours = hoursAt(event);
			if (hours === value) {
				setHeld(undefined);
				return;
			}
			setHeld({ hours, letGoAt: value });
			onCommit(hours);
		},
		onPointerCancel: () => {
			if (dragging) {
				setHeld(undefined);
			}
		},
	};
	return { live: held?.hours, handlers };
}
