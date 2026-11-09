// PROTOTYPE (#77), throwaway branch only: the slider's scale of 1–12 h and then days 2–5 (a day is 12 h of travel),
// on the real screen, switched by `?variant=` before the `#` (the hash router keeps it) or the bar at the bottom.
// Round 1 picked B (one column, the day cells taller and tinted) over A (16 equal cells) and C (two panels). Round 2
// (units on the hours: on each cell, as group captions, on the first cell) was too noisy. Round 3, on B:
// R: a ruler, the hours as ticks with numbers at 1, 6 and 12, the days numbered blocks.
// H: everything in hours, the days labelled 24, 36, 48, 60; the phrase says days.
// S: numbers only, «часы» and «дни» written sideways along each group.
// M: only the chosen cell is labelled; the hours are dots, the days blank blocks.
// The step of the scale is the screen's N: 1–12 are hours, 13–16 days 2–5.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type RefObject } from 'react';
import { MAX_HOURS, MIN_HOURS } from '../state/search.ts';
import { dayOfStep, hoursShort, hoursSpan } from './copy.ts';

const VARIANTS = ['r', 'h', 's', 'm'] as const;
type Variant = (typeof VARIANTS)[number];
const NAMES: Readonly<Record<Variant, string>> = {
	r: 'R · линейка',
	h: 'H · всё в часах',
	s: 'S · подписи сбоку',
	m: 'M · только выбранная',
};

const HOUR_STEPS = Array.from({ length: 12 }, (_, index) => 12 - index);
const DAY_STEPS = Array.from({ length: MAX_HOURS - 12 }, (_, index) => MAX_HOURS - index);

function variantOfLocation(): Variant {
	const value = new URLSearchParams(window.location.search).get('variant');
	return VARIANTS.find((variant) => variant === value) ?? 'r';
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
			className={`pv pv-b pv-${variant}`}
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

/** The chosen cell's label: «11–12ч», «1–2д»; in H, hours throughout, «12–24». */
function chosenLabel(variant: Variant, step: number): string {
	const day = dayOfStep(step);
	if (day === undefined) {
		return variant === 'h' ? hoursSpan(step) : `${hoursSpan(step)}ч`;
	}
	return variant === 'h' ? `${12 * (day - 1)}–${12 * day}` : `${day - 1}–${day}д`;
}

const RULER_NUMBERS: ReadonlySet<number> = new Set([1, 6, 12]);

/** What an unchosen cell shows. */
function idleLabel(variant: Variant, step: number): ReactElement | string {
	const day = dayOfStep(step);
	if (variant === 'm') {
		return day === undefined ? <i className="pv-dot" /> : '';
	}
	if (day !== undefined) {
		return variant === 'h' ? String(12 * day) : String(day);
	}
	if (variant === 'r') {
		return RULER_NUMBERS.has(step) ? (
			<>
				<i className="pv-tick long" />
				{step}
			</>
		) : (
			<i className="pv-tick" />
		);
	}
	return String(step);
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
	const cell = (step: number): ReactElement => (
		<span
			key={step}
			className={step === shown ? 'pv-cell on' : 'pv-cell'}
			data-step={step}
			data-day={dayOfStep(step) === undefined ? undefined : true}
			data-cached={cached.has(step) || undefined}
		>
			<b>{step === shown ? chosenLabel(variant, step) : idleLabel(variant, step)}</b>
		</span>
	);
	if (variant === 's') {
		return (
			<>
				<div className="pv-group pv-group-days" data-caption="дни">
					{DAY_STEPS.map((step) => cell(step))}
				</div>
				<div className="pv-group pv-group-hours" data-caption="часы">
					{HOUR_STEPS.map((step) => cell(step))}
				</div>
			</>
		);
	}
	return (
		<>
			{DAY_STEPS.map((step) => cell(step))}
			{HOUR_STEPS.map((step) => cell(step))}
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
