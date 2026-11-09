// PROTOTYPE (#77), throwaway branch only: three slider scales of 1–12 h and then days 2–5 (a day is 12 h of travel),
// on the real screen, switched by `?variant=` before the `#` (the hash router keeps it) or the bar at the bottom.
// A: one column of 16 equal cells, a «дни» mark between 12 h and 2 days.
// B: one column, the day cells taller and tinted, labelled «2д»…«5д».
// C: two panels, the days above the hours, labelled «2 дня»…«5 дней».
// The step of the scale is the screen's N: 1–12 are hours, 13–16 days 2–5.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type RefObject } from 'react';
import { MAX_HOURS, MIN_HOURS } from '../state/search.ts';
import { dayOfStep, hoursShort, hoursSpan, plural } from './copy.ts';

const VARIANTS = ['a', 'b', 'c'] as const;
type Variant = (typeof VARIANTS)[number];
const NAMES: Readonly<Record<Variant, string>> = { a: 'A · одна лента', b: 'B · дни крупнее', c: 'C · два блока' };

const HOUR_STEPS = Array.from({ length: 12 }, (_, index) => 12 - index);
const DAY_STEPS = Array.from({ length: MAX_HOURS - 12 }, (_, index) => MAX_HOURS - index);

function variantOfLocation(): Variant {
	const value = new URLSearchParams(window.location.search).get('variant');
	return VARIANTS.find((variant) => variant === value) ?? 'a';
}

/** The variant of `?variant=`, and its setter, which writes it back before the hash. */
export function usePrototypeVariant(): readonly [Variant, (variant: Variant) => void] {
	const [variant, setVariant] = useState<Variant>(variantOfLocation);
	const set = (next: Variant): void => {
		window.history.replaceState(window.history.state, '', `${window.location.pathname}?variant=${next}${window.location.hash}`);
		setVariant(next);
	};
	return [variant, set];
}

export interface PrototypeSliderProps {
	readonly variant: Variant;
	readonly value: number;
	readonly onCommit: (step: number) => void;
	readonly cached: ReadonlySet<number>;
}

const KEYS: Readonly<Partial<Record<string, number>>> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };

export function PrototypeSlider({ variant, value, onCommit, cached }: PrototypeSliderProps): ReactElement {
	const column = useRef<HTMLDivElement>(null);
	const { held, handlers } = useDrag(column, (step) => {
		if (step !== value) {
			onCommit(step);
		}
	});
	const shown = held ?? value;
	const onKeyDown = (event: KeyboardEvent): void => {
		const move = KEYS[event.key];
		if (move === undefined) {
			return;
		}
		event.preventDefault();
		const step = Math.min(MAX_HOURS, Math.max(MIN_HOURS, value + move));
		if (step !== value) {
			onCommit(step);
		}
	};
	return (
		<div
			className={`pv pv-${variant}`}
			// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- prototype of the slider's scale, as slider.tsx
			role="slider"
			tabIndex={0}
			aria-label="Время в пути"
			aria-orientation="vertical"
			aria-valuemin={MIN_HOURS}
			aria-valuemax={MAX_HOURS}
			aria-valuenow={shown}
			aria-valuetext={hoursShort(shown)}
			onKeyDown={onKeyDown}
			ref={column}
			{...handlers}
		>
			<Cells variant={variant} shown={shown} cached={cached} />
		</div>
	);
}

function Cells({
	variant,
	shown,
	cached,
}: {
	readonly variant: Variant;
	readonly shown: number;
	readonly cached: ReadonlySet<number>;
}): ReactElement {
	const cell = (step: number, label: string): ReactElement => (
		<span
			key={step}
			className={step === shown ? 'pv-cell on' : 'pv-cell'}
			data-step={step}
			data-day={dayOfStep(step) === undefined ? undefined : true}
			data-cached={cached.has(step) || undefined}
		>
			<b>{step === shown ? hoursSpan(step) : label}</b>
		</span>
	);
	const hours = HOUR_STEPS.map((step) => cell(step, String(step)));
	if (variant === 'a') {
		return (
			<>
				{DAY_STEPS.map((step) => cell(step, String(dayOfStep(step))))}
				<i className="pv-mark">дни</i>
				{hours}
			</>
		);
	}
	if (variant === 'b') {
		return (
			<>
				{DAY_STEPS.map((step) => cell(step, `${dayOfStep(step)}д`))}
				{hours}
			</>
		);
	}
	return (
		<>
			<div className="pv-block pv-days">
				{DAY_STEPS.map((step) => {
					const day = dayOfStep(step) ?? 0;
					return cell(step, `${day} ${plural(day, ['день', 'дня', 'дней'])}`);
				})}
			</div>
			<div className="pv-block pv-hours">{hours}</div>
		</>
	);
}

/** The step of the cell under the pointer, or of the nearest cell when it is between or past them. */
function stepAt(column: RefObject<HTMLDivElement | null>, clientY: number): number | undefined {
	let best: { step: number; distance: number } | undefined;
	for (const element of column.current?.querySelectorAll<HTMLElement>('[data-step]') ?? []) {
		const box = element.getBoundingClientRect();
		const distance = clientY < box.top ? box.top - clientY : Math.max(0, clientY - box.bottom);
		if (best === undefined || distance < best.distance) {
			best = { step: Number(element.dataset.step), distance };
		}
	}
	return best?.step;
}

/** A drag along the column: the cell under the pointer is held, and committed when the pointer is let go. */
function useDrag(column: RefObject<HTMLDivElement | null>, commit: (step: number) => void) {
	const [held, setHeld] = useState<number>();
	const handlers = {
		onPointerDown: (event: PointerEvent<HTMLDivElement>) => {
			event.currentTarget.setPointerCapture(event.pointerId);
			setHeld(stepAt(column, event.clientY));
		},
		onPointerMove: (event: PointerEvent) => {
			if (held !== undefined) {
				setHeld(stepAt(column, event.clientY));
			}
		},
		onPointerUp: (event: PointerEvent) => {
			const step = held === undefined ? undefined : stepAt(column, event.clientY);
			setHeld(undefined);
			if (step !== undefined) {
				commit(step);
			}
		},
		onPointerCancel: () => {
			setHeld(undefined);
		},
	};
	return { held, handlers };
}

/** The prototype's switcher: ‹ variant › at the bottom centre; ← and → too, but not on the slider or in a field. */
export function VariantBar({
	variant,
	onChange,
}: {
	readonly variant: Variant;
	readonly onChange: (variant: Variant) => void;
}): ReactElement {
	const index = VARIANTS.indexOf(variant);
	const go = (by: number): void => {
		onChange(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length]);
	};
	useEffect(() => {
		const onKey = (event: globalThis.KeyboardEvent): void => {
			const target = event.target instanceof HTMLElement ? event.target : null;
			if (target !== null && target.closest('input, textarea, [contenteditable], [role="slider"]') !== null) {
				return;
			}
			if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
				go(event.key === 'ArrowLeft' ? -1 : 1);
			}
		};
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('keydown', onKey);
		};
	});
	return (
		<div className="pv-bar">
			<button
				type="button"
				onClick={() => {
					go(-1);
				}}
				aria-label="Предыдущий вариант"
			>
				‹
			</button>
			<span>{NAMES[variant]}</span>
			<button
				type="button"
				onClick={() => {
					go(1);
				}}
				aria-label="Следующий вариант"
			>
				›
			</button>
		</div>
	);
}
