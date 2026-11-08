// The vertical slider of N (spec «Экран», «Ползунок»): 1–12 h at the right edge of the map. While it is dragged
// only the bubble changes; the new N is committed when it is let go (a key commits at once), so a drag asks for
// one ring, not one per hour it passed. The hours whose rings are in memory have dots.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { MAX_HOURS, MIN_HOURS } from '../state/search.ts';
import { hoursShort } from './copy.ts';

export interface SliderProps {
	readonly value: number;
	readonly onCommit: (hours: number) => void;
	readonly cached: ReadonlySet<number>;
}

const STEPS = MAX_HOURS - MIN_HOURS;
const KEYS: Readonly<Record<string, number>> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
/** The hours with a number next to their tick. */
const LABELLED = new Set([1, 3, 6, 9, 12]);

export function Slider({ value, onCommit, cached }: SliderProps) {
	const [live, setLive] = useState<number>();
	const track = useRef<HTMLDivElement>(null);
	const shown = live ?? value;
	const position = `${((shown - MIN_HOURS) / STEPS) * 100}%`;

	const hoursAt = (event: PointerEvent): number => {
		const box = track.current?.getBoundingClientRect();
		if (box === undefined || box.height === 0) {
			return value;
		}
		const fraction = Math.min(1, Math.max(0, 1 - (event.clientY - box.top) / box.height));
		return MIN_HOURS + Math.round(fraction * STEPS);
	};
	const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		setLive(hoursAt(event));
	};
	const onPointerMove = (event: PointerEvent) => {
		if (live !== undefined) {
			setLive(hoursAt(event));
		}
	};
	const onPointerUp = (event: PointerEvent) => {
		if (live === undefined) {
			return;
		}
		const hours = hoursAt(event);
		setLive(undefined);
		if (hours !== value) {
			onCommit(hours);
		}
	};
	const onKeyDown = (event: KeyboardEvent) => {
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
			className="sl sl-v"
			role="slider"
			tabIndex={0}
			aria-label="Время в пути"
			aria-orientation="vertical"
			aria-valuemin={MIN_HOURS}
			aria-valuemax={MAX_HOURS}
			aria-valuenow={shown}
			aria-valuetext={hoursShort(shown)}
			onKeyDown={onKeyDown}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={() => {
				setLive(undefined);
			}}
		>
			<div className="sl-track" ref={track}>
				<div className="sl-fill" style={{ height: position }} />
				{Array.from({ length: STEPS + 1 }, (_, index) => {
					const hours = MIN_HOURS + index;
					const classes = ['sl-tick', hours <= shown ? 'on' : '', cached.has(hours) ? 'sl-cached' : ''].filter(Boolean).join(' ');
					return (
						<span
							key={hours}
							className={classes}
							style={{ bottom: `${(index / STEPS) * 100}%` }}
							data-hours={hours}
							data-cached={cached.has(hours) || undefined}
						>
							<i />
							{LABELLED.has(hours) ? <em>{hours}</em> : null}
						</span>
					);
				})}
				<div className="sl-thumb" style={{ bottom: position }}>
					{live === undefined ? null : <b>{hoursShort(shown)}</b>}
				</div>
			</div>
		</div>
	);
}
