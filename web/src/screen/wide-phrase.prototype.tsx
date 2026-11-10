// PROTOTYPE, never merged (#103 «Фраза и источники данных на широком экране», map #95): three variants of the phrase
// and the data's sources on the wide screen (≥ 720 × 500, #96), chosen by the bar at the left edge, the keys [ and ],
// or `?variant=A|B|C` before the hash once (`/?variant=B#/?p=…`). The narrow screen keeps screen.tsx's layout. The
// slider is #97's decision (a row over the carousel at the bottom left), copied from its prototype
// (`claude/fervent-tesla-qqsbc0`, wide-slider.prototype.tsx) with variant C only. Styles: the end of styles.css.
//
// A «Колонка слева»: the phrase by its text, up to 520 px, at the top left, each sentence on its own line; the sources
//   under it, as wide as it.
// B «По центру, источники в углу»: the phrase by its text, up to 760 px, centred at the top; the sources in the bottom
//   right corner over the carousel, on the slider's row, as a map's attribution.
// C «Одна плашка»: the phrase by its text, up to 720 px, at the top left; the sources inside the same panel under a
//   line, as wide as the phrase; when they go, the panel shrinks.
// In all three the comma after «Гражданство [..]» stays on its token's line (#101, item 3).
import { useEffect, useState, useSyncExternalStore, type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { HOURS_PER_DAY, MAX_HOURS, SLIDER_CELLS } from 'worker/api';
import { SourcesOnOpen } from './attribution.tsx';
import { Carousel } from './carousel.tsx';
import { daysWord, hoursSpan, hoursShort, isDay } from './copy.ts';
import { PinBar } from './pin-bar.tsx';
import { ScreenMap } from './screen-map.tsx';
import { ScreenPhrase } from './screen-phrase.tsx';
import { ScreenSheets } from './screen-sheets.tsx';
import type { ScreenModel } from './use-screen.ts';

type Variant = 'A' | 'B' | 'C';
const VARIANTS: readonly Variant[] = ['A', 'B', 'C'];
const NAMES: Record<Variant, string> = {
	A: 'Колонка слева',
	B: 'По центру, источники в углу',
	C: 'Одна плашка',
};

const WIDE = '(min-width: 720px) and (min-height: 500px)';

export function useWide(): boolean {
	return useSyncExternalStore(
		(changed) => {
			const query = matchMedia(WIDE);
			query.addEventListener('change', changed);
			return () => {
				query.removeEventListener('change', changed);
			};
		},
		() => matchMedia(WIDE).matches,
	);
}

const VARIANT_EVENT = 'prototype:variant';

const STORED = 'prototype-103-variant';

// `?variant=` is taken once and dropped: the router's hash history reads a search before the hash into its own on a
// hash change. The variant lives in the browser's storage from then on.
const asked = new URLSearchParams(location.search).get('variant');
if (asked !== null) {
	try {
		localStorage.setItem(STORED, asked);
	} catch {
		// No storage: the default variant.
	}
	history.replaceState(history.state, '', `${location.pathname}${location.hash}`);
}

function readVariant(): Variant {
	let stored: string | null = null;
	try {
		stored = localStorage.getItem(STORED);
	} catch {
		// No storage: the default variant.
	}
	return VARIANTS.find((variant) => variant === stored) ?? 'A';
}

function stepVariant(from: Variant, by: number): void {
	try {
		localStorage.setItem(STORED, VARIANTS[(VARIANTS.indexOf(from) + by + VARIANTS.length) % VARIANTS.length]);
	} catch {
		// No storage: the bar does nothing.
	}
	dispatchEvent(new Event(VARIANT_EVENT));
}

function useVariant(): Variant {
	const variant = useSyncExternalStore((changed) => {
		addEventListener(VARIANT_EVENT, changed);
		return () => {
			removeEventListener(VARIANT_EVENT, changed);
		};
	}, readVariant);
	useEffect(() => {
		const onKey = (event: globalThis.KeyboardEvent): void => {
			const by = { '[': -1, ']': 1 }[event.key];
			if (by !== undefined && !(event.target instanceof HTMLInputElement)) {
				stepVariant(variant, by);
			}
		};
		addEventListener('keydown', onKey);
		return () => {
			removeEventListener('keydown', onKey);
		};
	}, [variant]);
	return variant;
}

/** The switcher: a dark pill at the left edge, not part of the design. */
function VariantBar({ variant }: { readonly variant: Variant }): ReactElement {
	return (
		<div className="proto-bar">
			<button
				type="button"
				onClick={() => {
					stepVariant(variant, -1);
				}}
				aria-label="Предыдущий вариант"
			>
				‹
			</button>
			<span>
				{variant} · {NAMES[variant]}
			</span>
			<button
				type="button"
				onClick={() => {
					stepVariant(variant, 1);
				}}
				aria-label="Следующий вариант"
			>
				›
			</button>
		</div>
	);
}

/** The wide screen: the phrase and the sources by variant, the slider's row and the carousel at the bottom. */
export function WideScreen({ screen }: { readonly screen: ScreenModel }): ReactElement {
	const variant = useVariant();
	const { state, shown, starts } = screen;
	const slider =
		state.origin !== undefined && !starts.pinning ? (
			<WideSlider value={state.hours} onCommit={state.setHours} cached={shown.cachedHours} />
		) : null;
	return (
		<div className="screen">
			<ScreenMap screen={screen} />
			<div className={`w pv pv-${variant.toLowerCase()}`}>
				<div className="w-top">
					<div className="pv-card">
						<ScreenPhrase screen={screen} />
						{variant === 'B' ? null : <SourcesOnOpen />}
					</div>
				</div>
				<div className="w-mid" />
				<div className="w-bottom">
					<div className="pv-row">
						{slider}
						{variant === 'B' ? <SourcesOnOpen /> : null}
					</div>
					{starts.pinning ? <PinBar onCancel={starts.cancelPinning} onStart={starts.startHere} /> : <Carousel screen={screen} />}
				</div>
			</div>
			<ScreenSheets screen={screen} />
			<VariantBar variant={variant} />
		</div>
	);
}

// ---------- the slider: #97's variant C, copied from its prototype ----------

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

function WideSlider({ value, onCommit, cached }: WideSliderProps): ReactElement {
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

/** The other unit's tab at the row's end: «дни →» after the hours, «← часы» before the days. */
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
