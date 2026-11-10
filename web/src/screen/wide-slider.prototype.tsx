// PROTOTYPE, never merged (#99, map #95): the slider of the wide screen as the Owner chose it in #97 «Ползунок на
// широком экране», variant C of branch `claude/fervent-tesla-qqsbc0` (b6b9d85) without A and B: a row over the
// carousel at the bottom left, one unit at a time, the other unit's tab at its end. Only so the arrows of #99 are seen
// in the layout they will live in. Styles: the end of styles.css.
import { useState, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { HOURS_PER_DAY, MAX_HOURS, SLIDER_CELLS } from 'worker/api';
import { daysWord, hoursShort, hoursSpan, isDay } from './copy.ts';

interface WideSliderProps {
	readonly value: number;
	readonly onCommit: (hours: number) => void;
	readonly cached: ReadonlySet<number>;
}

const HOUR_CELLS = SLIDER_CELLS.filter((hours) => !isDay(hours));
const DAY_CELLS = SLIDER_CELLS.filter((hours) => isDay(hours));
const KEYS: Partial<Record<string, number>> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };

function hoursAt(event: PointerEvent): number | undefined {
	const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-hours]');
	return cell ? Number(cell.dataset.hours) : undefined;
}

export function WideSlider({ value, onCommit, cached }: WideSliderProps): ReactElement {
	const [live, setLive] = useState<number>();
	const shown = live ?? value;
	const onKeyDown = (event: KeyboardEvent): void => {
		const next = SLIDER_CELLS[SLIDER_CELLS.indexOf(value) + (KEYS[event.key] ?? 0)] as number | undefined;
		if (next !== undefined && next !== value) {
			event.preventDefault();
			onCommit(next);
		}
	};
	return (
		<div className="ws ws-c">
			{isDay(value) ? <Tab to={MAX_HOURS} shown={shown} onCommit={onCommit} /> : null}
			<div
				className="ws-track"
				// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- prototype: the slider's role, as in slider.tsx
				role="slider"
				tabIndex={0}
				aria-label="Время в пути"
				aria-orientation="horizontal"
				aria-valuemin={SLIDER_CELLS[0]}
				aria-valuemax={SLIDER_CELLS.at(-1)}
				aria-valuenow={shown}
				aria-valuetext={hoursShort(shown)}
				onKeyDown={onKeyDown}
				onPointerDown={(event) => {
					event.currentTarget.setPointerCapture(event.pointerId);
					setLive(hoursAt(event));
				}}
				onPointerMove={(event) => {
					if (live !== undefined) {
						setLive(hoursAt(event) ?? live);
					}
				}}
				onPointerUp={() => {
					if (live !== undefined && live !== value) {
						onCommit(live);
					}
					setLive(undefined);
				}}
				onPointerCancel={() => {
					setLive(undefined);
				}}
			>
				<div className="ws-group">
					{(isDay(value) ? DAY_CELLS : HOUR_CELLS).map((hours) => (
						<Cell key={hours} hours={hours} shown={shown} cached={cached} />
					))}
				</div>
			</div>
			{isDay(value) ? null : <Tab to={HOURS_PER_DAY * 2} shown={shown} onCommit={onCommit} />}
		</div>
	);
}

/** The tab of the other unit at the row's end on its side: «дни →» after the hours, «← часы» before the days. */
function Tab({
	to,
	shown,
	onCommit,
}: {
	readonly to: number;
	readonly shown: number;
	readonly onCommit: (hours: number) => void;
}): ReactElement {
	return (
		<button
			type="button"
			className={shown === to ? 'ws-tab on' : 'ws-tab'}
			data-hours={to}
			onClick={() => {
				onCommit(to);
			}}
		>
			{isDay(to) ? 'дни →' : '← часы'}
		</button>
	);
}

function Cell({
	hours,
	shown,
	cached,
}: {
	readonly hours: number;
	readonly shown: number;
	readonly cached: ReadonlySet<number>;
}): ReactElement {
	const chosen = hours === shown;
	return (
		<span
			className={chosen ? 'ws-cell on' : 'ws-cell'}
			data-hours={hours}
			data-day={isDay(hours) || undefined}
			data-cached={cached.has(hours) || undefined}
		>
			{chosen ? (
				<span className="ws-num">
					{hoursSpan(hours)}
					<small>{isDay(hours) ? daysWord(hours) : 'ч'}</small>
				</span>
			) : (
				<span className="ws-num">{isDay(hours) ? hours / HOURS_PER_DAY : hours}</span>
			)}
		</span>
	);
}
