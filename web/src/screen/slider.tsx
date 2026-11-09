// The vertical slider of N (spec «Экран», «Ползунок»): 1–12 h at the right edge of the map, a column of twelve
// cells, 1 at the bottom. A cell is the ring from N − 1 to N h, and the chosen one is blue. While the slider is
// dragged the cell under the pointer is chosen on the screen only; the new N is committed when it is let go (a key
// commits at once), so a drag asks for one ring, not one per hour it passed, and a tap on a cell chooses it. The hours
// whose rings are in memory have a light green cell. Here the screen departs from the prototype's track and thumb.
import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type RefObject } from 'react';
import { MAX_HOURS, MIN_HOURS } from '../state/search.ts';
import { hoursShort, hoursSpan } from './copy.ts';

export interface SliderProps {
	readonly value: number;
	readonly onCommit: (hours: number) => void;
	readonly cached: ReadonlySet<number>;
}

const CELLS = MAX_HOURS - MIN_HOURS + 1;
const KEYS: Readonly<Partial<Record<string, number>>> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
/** The hours from the top cell down. */
const HOURS = Array.from({ length: CELLS }, (_, index) => MAX_HOURS - index);

export function Slider({ value, onCommit, cached }: SliderProps): ReactElement {
	const column = useRef<HTMLDivElement>(null);
	const { live, handlers } = useDrag(column, value, onCommit);
	const shown = live ?? value;
	const onKeyDown = (event: KeyboardEvent): void => {
		const step = KEYS[event.key];
		if (step === undefined) {
			return;
		}
		event.preventDefault();
		const hours = Math.min(MAX_HOURS, Math.max(MIN_HOURS, value + step));
		if (hours !== value) {
			onCommit(hours);
		}
	};

	return (
		<div
			className="sl"
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a column of twelve cells, the chosen one blue and those of the rings in memory green, which a range input does not draw; it has the slider's role, keys and values
			role="slider"
			tabIndex={0}
			aria-label="Время в пути"
			aria-orientation="vertical"
			aria-valuemin={MIN_HOURS}
			aria-valuemax={MAX_HOURS}
			aria-valuenow={shown}
			aria-valuetext={hoursShort(shown)}
			onKeyDown={onKeyDown}
			{...handlers}
		>
			<div className="sl-cells" ref={column}>
				{/* The blue block under the chosen cell: in the bottom one, raised by a cell and a gap for each hour below. */}
				<div className="sl-chosen" style={{ transform: `translateY(calc(${MIN_HOURS - shown} * (100% + var(--gap))))` }} />
				{HOURS.map((hours) => (
					<span
						key={hours}
						className={hours === shown ? 'sl-cell on' : 'sl-cell'}
						data-hours={hours}
						data-cached={cached.has(hours) || undefined}
					>
						<b>{hours === shown ? hoursSpan(hours) : hours}</b>
					</span>
				))}
			</div>
		</div>
	);
}

interface Drag {
	/** The hours under the pointer while the slider is dragged; undefined otherwise. */
	readonly live: number | undefined;
	readonly handlers: {
		readonly onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
		readonly onPointerMove: (event: PointerEvent) => void;
		readonly onPointerUp: (event: PointerEvent) => void;
		readonly onPointerCancel: () => void;
	};
}

/** A drag along the column: the cell under the pointer is chosen, and committed when the pointer is let go. */
function useDrag(column: RefObject<HTMLDivElement | null>, value: number, onCommit: (hours: number) => void): Drag {
	const [live, setLive] = useState<number>();
	const hoursAt = (event: PointerEvent): number => {
		const box = column.current?.getBoundingClientRect();
		if (box === undefined || box.height === 0) {
			return value;
		}
		// The column's twelfths from the bottom, the gaps split between their cells; above or below it, the end cell.
		const index = Math.floor(((box.bottom - event.clientY) / box.height) * CELLS);
		return MIN_HOURS + Math.min(CELLS - 1, Math.max(0, index));
	};
	const handlers = {
		onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			setLive(hoursAt(event));
		},
		onPointerMove: (event: PointerEvent) => {
			if (live !== undefined) {
				setLive(hoursAt(event));
			}
		},
		onPointerUp: (event: PointerEvent) => {
			if (live === undefined) {
				return;
			}
			const hours = hoursAt(event);
			setLive(undefined);
			if (hours !== value) {
				onCommit(hours);
			}
		},
		onPointerCancel: () => {
			setLive(undefined);
		},
	};
	return { live, handlers };
}
