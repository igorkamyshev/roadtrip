// PROTOTYPE, never merged (#99 «Стрелки у карусели при мыши», map #95): three ways to scroll the carousel with a mouse
// and no trackpad, chosen by the bar at the left edge, the keys [ and ], or `?variant=A|B|C` before the hash once
// (`/?variant=B#/?p=…`). Shown only with a mouse, `(hover: hover) and (pointer: fine)` (#105), at any width: on the wide
// screen (≥ 720 × 500, #96) in the layout of #97 (the slider's row over the carousel, which runs the whole width) and
// #104 (a scroll chooses nothing, a click does), on the narrow one in the phone's layout, where a stop still chooses
// the card at the left edge. Styles: the end of styles.css. The arrows themselves: carousel-arrows.prototype.tsx.
//
// A «Стрелки на краях ряда»: round arrows over the row's two ends, each only while there is somewhere to go; a step is
// the visible part of the row (one card on the narrow screen); the wheel and the keys ← → scroll too.
// B «Пара стрелок над рядом»: one plate ‹ › over the row's right end, in the slider's line (over the left end on the
// narrow screen); a step is one card; at an end its arrow is greyed; no wheel, no keys.
// C «Без стрелок»: the wheel, a drag with the mouse and a thin scrollbar under the cards; the keys ← → too.
import { useEffect, useSyncExternalStore, type ReactElement } from 'react';
import { SourcesOnOpen } from './attribution.tsx';
import { CarouselArrows } from './carousel-arrows.prototype.tsx';
import { Carousel } from './carousel.tsx';
import { PinBar } from './pin-bar.tsx';
import { ScreenMap } from './screen-map.tsx';
import { ScreenPhrase } from './screen-phrase.tsx';
import { ScreenSheets } from './screen-sheets.tsx';
import type { ScreenModel } from './use-screen.ts';
import { WideSlider } from './wide-slider.prototype.tsx';

export type Variant = 'A' | 'B' | 'C';
const VARIANTS: readonly Variant[] = ['A', 'B', 'C'];
const NAMES: Record<Variant, string> = {
	A: 'Стрелки на краях ряда',
	B: 'Пара стрелок над рядом',
	C: 'Без стрелок: колесо и перетаскивание',
};

const WIDE = '(min-width: 720px) and (min-height: 500px)';
const MOUSE = '(hover: hover) and (pointer: fine)';

function useMedia(query: string): boolean {
	return useSyncExternalStore(
		(changed) => {
			const list = matchMedia(query);
			list.addEventListener('change', changed);
			return () => {
				list.removeEventListener('change', changed);
			};
		},
		() => matchMedia(query).matches,
	);
}

export function useWide(): boolean {
	return useMedia(WIDE);
}

function useMouse(): boolean {
	return useMedia(MOUSE);
}

function isWideNow(): boolean {
	return matchMedia(WIDE).matches;
}

/** A handler of the carousel's stops that does nothing on the wide screen, where a stop chooses nothing (#104). */
export function narrowOnly(handler: (city: number | undefined) => void): (city: number | undefined) => void {
	return (city) => {
		if (!isWideNow()) {
			handler(city);
		}
	};
}

/** Whether a city with a card is to be chosen by the wide screen's rule (#104): at once, its card nudged into view. */
export function wideCard(carousel: HTMLElement | null, city: number): boolean {
	return isWideNow() && (carousel?.querySelector(`[data-city="${city}"]`) ?? null) !== null;
}

const VARIANT_EVENT = 'prototype:variant';

const STORED = 'prototype-99-variant';

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
function VariantBar({ variant, mouse }: { readonly variant: Variant; readonly mouse: boolean }): ReactElement {
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
				{mouse ? '' : ' (нет мыши: стрелок нет)'}
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

/** What the prototype adds to either screen: the variant's arrows, with a mouse, and the switcher. */
export function PrototypeExtras({ screen, wide }: { readonly screen: ScreenModel; readonly wide: boolean }): ReactElement {
	const variant = useVariant();
	const mouse = useMouse();
	// C's cursor over the row: styles.css.
	useEffect(() => {
		document.documentElement.dataset.pcVariant = mouse ? variant : undefined;
	}, [variant, mouse]);
	return (
		<>
			{mouse && !screen.starts.pinning ? (
				<CarouselArrows key={`${variant}${wide}`} variant={variant} wide={wide} carousel={screen.chosen.carousel} />
			) : null}
			<VariantBar variant={variant} mouse={mouse} />
		</>
	);
}

/** The wide screen of #97 C, #103 aside: the phrase and the sources on top, the slider's row over the carousel. */
export function WideScreen({ screen }: { readonly screen: ScreenModel }): ReactElement {
	const { state, shown, starts } = screen;
	return (
		<div className="screen">
			<ScreenMap screen={screen} />
			<div className="w">
				<div className="w-top">
					<ScreenPhrase screen={screen} />
					<SourcesOnOpen />
				</div>
				<div className="w-mid" />
				<div className="w-bottom">
					{state.origin !== undefined && !starts.pinning ? (
						<WideSlider value={state.hours} onCommit={state.setHours} cached={shown.cachedHours} />
					) : null}
					{starts.pinning ? <PinBar onCancel={starts.cancelPinning} onStart={starts.startHere} /> : <Carousel screen={screen} />}
				</div>
			</div>
			<ScreenSheets screen={screen} />
			<PrototypeExtras screen={screen} wide />
		</div>
	);
}
