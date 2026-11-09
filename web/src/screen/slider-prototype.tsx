// PROTOTYPE (#77), throwaway branch only: the slider's scale of 1–12 h and then days 2–5 (a day is 12 h of travel),
// on the real screen, switched by `?variant=` before the `#` (the hash router keeps it) or the bar at the bottom.
// Rounds 1–3 showed hours and days in one column at once (A, B, C; units on the hours; a ruler, hours only, side
// captions, the chosen cell only): two units side by side are noise whatever the labels. Round 4: the column is in
// one unit at a time, as today. In hours, the 12 cells of today and the days folded into a strip «дни» on top; a step
// up from 12 h (a key, a tap or a drag onto the strip) turns the column over: days 2–5 at full height, the hours
// folded into a strip «часы» at the bottom. The column turns over when N is committed, not under the finger.
// Z1: the strip inside the panel. Z2: the strip a tab outside it, above or below. Z2 won, but its tab takes ~32 px of
// height from the hours, which a phone in Safari lacks; Z3: the tab beside the panel, on its left, at the top cell in
// hours and the bottom cell in days, so the hours keep all of today's height. Z3F: Z3 down to the bottom of the screen
// over the carousel, which no longer bounds it; the cards pass under it and fade out before they reach it. Z2F: the
// Owner's pick, Z2's tab (above the panel in hours, below it in days) in Z3F's column down to the bottom.
// The step of the scale is the screen's N: 1–12 are hours, 13–16 days 2–5.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement, type RefObject } from 'react';
import { MAX_HOURS, MIN_HOURS } from '../state/search.ts';
import { dayOfStep, hoursShort, hoursSpan, plural } from './copy.ts';

const VARIANTS = ['z2f', 'z3f'] as const;
type Variant = (typeof VARIANTS)[number];
const NAMES: Readonly<Record<Variant, string>> = { z2f: 'Z2F · язычок сверху, над каруселью', z3f: 'Z3F · язычок слева, над каруселью' };

const HOUR_STEPS = Array.from({ length: 12 }, (_, index) => 12 - index);
const DAY_STEPS = Array.from({ length: MAX_HOURS - 12 }, (_, index) => MAX_HOURS - index);

function variantOfLocation(): Variant {
	const value = new URLSearchParams(window.location.search).get('variant');
	return VARIANTS.find((variant) => variant === value) ?? 'z2f';
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
			className={`pv pv-z pv-${variant}`}
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
			<Cells value={value} shown={shown} cached={cached} />
		</div>
	);
}

/** The chosen cell's label: hours as today («до 1», «6–7»); a day on two lines, «2–3» over «дня». */
function chosenLabel(step: number): ReactElement | string {
	const day = dayOfStep(step);
	if (day === undefined) {
		return hoursSpan(step);
	}
	return (
		<>
			{day - 1}–{day}
			<small>{plural(day, ['дня', 'дня', 'дней'])}</small>
		</>
	);
}

interface CellsProps {
	/** The committed N: the column's unit follows it, not the finger. */
	readonly value: number;
	readonly shown: number;
	readonly cached: ReadonlySet<number>;
}

function Cells({ value, shown, cached }: CellsProps): ReactElement {
	const inDays = dayOfStep(value) !== undefined;
	const cell = (step: number): ReactElement => (
		<span
			key={step}
			className={step === shown ? 'pv-cell on' : 'pv-cell'}
			data-step={step}
			data-day={dayOfStep(step) === undefined ? undefined : true}
			data-cached={cached.has(step) || undefined}
		>
			<b>{step === shown ? chosenLabel(step) : String(dayOfStep(step) ?? step)}</b>
		</span>
	);
	// The strip of the other unit: a step into it, 2 days from the hours, 12 h from the days.
	const strip = (
		<span className={`pv-strip pv-tab ${shown === (inDays ? 12 : 13) ? 'on' : ''}`} data-step={inDays ? 12 : 13}>
			{inDays ? 'часы ↓' : 'дни ↑'}
		</span>
	);
	const cells = <div className="pv-cells">{(inDays ? DAY_STEPS : HOUR_STEPS).map((step) => cell(step))}</div>;
	return inDays ? (
		<>
			{cells}
			{strip}
		</>
	) : (
		<>
			{strip}
			{cells}
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
