// The vertical slider (spec #20 «Экран», «Ползунок»; #83): the hours 1–12, then the days 2…MAX_DAYS, at the right edge
// of the map. The column is in one unit at a time, the other folded into a tab: in hours a column of twelve cells,
// 1 at the bottom, with «дни ↑» over it; in days a cell a day, 2 at the bottom, with «часы ↓» under it. A cell is a
// ring, N − 1 to N h or D − 1 to D days, and the chosen one is blue. While the slider is dragged the cell under the
// pointer, or the tab, is chosen on the screen only; the new cell is committed when it is let go (a key commits at
// once), so a drag asks for one ring, not one per cell it passed, and a tap on a cell or the tab chooses it. The column
// turns to the other unit only once that is committed, never under the finger. The cells whose rings are in memory are
// light green. Here the screen departs from the prototype's track and thumb.
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type RefObject } from 'react';
import { HOURS_PER_DAY, MAX_HOURS, SLIDER_CELLS } from 'worker/api';
import { daysWord, hoursShort, hoursSpan, isDay } from './copy.ts';

export interface SliderProps {
	/** The chosen cell by its upper bound in hours (worker/api's `SLIDER_CELLS`). */
	readonly value: number;
	readonly onCommit: (hours: number) => void;
	readonly cached: ReadonlySet<number>;
}

const KEYS: Readonly<Partial<Record<string, number>>> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };

/** A unit of the column: its cells from the bottom, and its tab, which chooses the other unit's nearest cell. */
interface Unit {
	readonly cells: readonly number[];
	readonly tab: { readonly hours: number; readonly label: string };
}

const HOURS: Unit = {
	cells: SLIDER_CELLS.filter((hours) => !isDay(hours)),
	tab: { hours: SLIDER_CELLS[MAX_HOURS], label: 'дни ↑' },
};
const DAYS: Unit = { cells: SLIDER_CELLS.filter((hours) => isDay(hours)), tab: { hours: MAX_HOURS, label: 'часы ↓' } };

export function Slider({ value, onCommit, cached }: SliderProps): ReactElement {
	const inDays = isDay(value);
	const unit = inDays ? DAYS : HOURS;
	const column = useRef<HTMLDivElement>(null);
	const { live, handlers } = useDrag({ column, unit, inDays }, value, onCommit);
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
			{unit.tab.label}
		</span>
	);

	return (
		<div
			className="sl"
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a column of cells, the chosen one blue and those of the rings in memory green, with a tab for the other unit, which a range input does not draw; it has the slider's role, keys and values
			role="slider"
			tabIndex={0}
			aria-label="Время в пути"
			aria-orientation="vertical"
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

/** The panel of the unit's cells, from the bottom, the chosen one on the blue block. */
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
		<div className="sl-panel">
			<div className="sl-cells" ref={column} style={{ gridTemplateRows: `repeat(${count}, 1fr)` }}>
				{/* The blue block under the chosen cell: in the bottom one, raised by a cell and a gap for each below. */}
				{chosen === -1 ? null : (
					<div
						className="sl-chosen"
						style={{
							height: `calc((100% - ${count - 1} * var(--gap)) / ${count})`,
							transform: `translateY(calc(${-chosen} * (100% + var(--gap))))`,
						}}
					/>
				)}
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
 * A drag along the column: the cell under the pointer is chosen, or the tab past the column's end on the tab's side,
 * and committed when the pointer is let go.
 */
function useDrag(
	{ column, unit, inDays }: { readonly column: RefObject<HTMLDivElement | null>; readonly unit: Unit; readonly inDays: boolean },
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
		const box = column.current?.getBoundingClientRect();
		if (box === undefined || box.height === 0) {
			return value;
		}
		if (inDays ? event.clientY > box.bottom : event.clientY < box.top) {
			return unit.tab.hours;
		}
		// The column's cells from the bottom, the gaps split between them; past its other end, the end cell.
		const { cells } = unit;
		const index = Math.floor(((box.bottom - event.clientY) / box.height) * cells.length);
		return cells[Math.min(cells.length - 1, Math.max(0, index))];
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
