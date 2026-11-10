// PROTOTYPE, never merged (#99): the carousel's arrows of each variant; which variant does what:
// wide-carousel.prototype.tsx. The controls stand fixed over the screen, placed from the carousel's box, so neither
// layout changes for them.
import { useState, type PointerEvent, type ReactElement, type RefObject } from 'react';
import { freeScroll, step, useArrowKeys, useDrag, useGeometry, useWheel, type Geometry } from './carousel-scroll.prototype.ts';
import type { Variant } from './wide-carousel.prototype.tsx';

function Chevron({ back }: { readonly back: boolean }): ReactElement {
	return (
		<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
			<path
				d={back ? 'M12.5 4 6.5 10l6 6' : 'M7.5 4l6 6-6 6'}
				fill="none"
				stroke="currentColor"
				strokeWidth="2.2"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

interface ControlsProps {
	readonly geometry: Geometry;
	readonly atStart: boolean;
	readonly atEnd: boolean;
	readonly go: (direction: number) => void;
}

/** A: round arrows over the row's ends, centred on the cards; each shows only while there is somewhere to go. */
function EdgeArrows({ geometry, atStart, atEnd, go }: ControlsProps): ReactElement {
	const top = geometry.top + geometry.padTop + (geometry.bottom - geometry.top - geometry.padTop - geometry.padBottom) / 2 - 20;
	return (
		<>
			<button
				type="button"
				className={atStart ? 'pc-edge off' : 'pc-edge'}
				style={{ top, left: geometry.left + geometry.padLeft - 8 }}
				aria-label="Листать назад"
				tabIndex={-1}
				onClick={() => {
					go(-1);
				}}
			>
				<Chevron back />
			</button>
			<button
				type="button"
				className={atEnd ? 'pc-edge off' : 'pc-edge'}
				style={{ top, left: geometry.right - geometry.padRight + 8 - 40 }}
				aria-label="Листать вперёд"
				tabIndex={-1}
				onClick={() => {
					go(1);
				}}
			>
				<Chevron back={false} />
			</button>
		</>
	);
}

/**
 * B: one plate ‹ › over the row: on the wide screen at its right end, in the slider's line (a line higher where the
 * slider's row would meet it), on the narrow one at its left end; the arrow of an end is greyed.
 */
function PairArrows({ geometry, atStart, atEnd, go, wide }: ControlsProps & { readonly wide: boolean }): ReactElement {
	const height = 52;
	const width = 94;
	const right = geometry.right - geometry.padRight;
	const meets = wide && geometry.sliderRight + 8 > right - width;
	const top = (meets ? geometry.sliderTop : geometry.top) - 8 - height;
	return (
		<div className="pc-pair" style={wide ? { top, left: right - width } : { top, left: geometry.left + geometry.padLeft }}>
			<button
				type="button"
				disabled={atStart}
				aria-label="Листать назад"
				onClick={() => {
					go(-1);
				}}
			>
				<Chevron back />
			</button>
			<button
				type="button"
				disabled={atEnd}
				aria-label="Листать вперёд"
				onClick={() => {
					go(1);
				}}
			>
				<Chevron back={false} />
			</button>
		</div>
	);
}

/** C: a thin scrollbar under the cards; its thumb drags the row, a click beside it steps a card that way. */
function Scrollbar({
	geometry,
	carousel,
}: {
	readonly geometry: Geometry;
	readonly carousel: RefObject<HTMLElement | null>;
}): ReactElement {
	const [drag, setDrag] = useState<{ readonly x: number; readonly scroll: number; readonly snapBack: () => void }>();
	const left = geometry.left + geometry.padLeft;
	const track = geometry.right - geometry.padRight - left;
	const thumb = Math.max(40, (track * geometry.client) / (geometry.client + geometry.max));
	const at = ((track - thumb) * geometry.scroll) / geometry.max;
	const onThumbMove = (event: PointerEvent): void => {
		if (drag !== undefined) {
			carousel.current?.scrollTo({ left: drag.scroll + ((event.clientX - drag.x) * geometry.max) / (track - thumb) });
		}
	};
	const onThumbUp = (): void => {
		drag?.snapBack();
		setDrag(undefined);
	};
	return (
		<div
			className="pc-bar"
			style={{ top: geometry.bottom - geometry.padBottom - 2, left, width: track }}
			onPointerDown={(event) => {
				if (event.target === event.currentTarget) {
					step(carousel.current, event.clientX < left + at ? -1 : 1, false);
				}
			}}
		>
			<div
				className={drag === undefined ? 'pc-thumb' : 'pc-thumb on'}
				style={{ left: at, width: thumb }}
				onPointerDown={(event) => {
					const element = carousel.current;
					if (element !== null) {
						event.currentTarget.setPointerCapture(event.pointerId);
						setDrag({ x: event.clientX, scroll: element.scrollLeft, snapBack: freeScroll(element) });
					}
				}}
				onPointerMove={onThumbMove}
				onPointerUp={onThumbUp}
				onPointerCancel={onThumbUp}
			/>
		</div>
	);
}

export function CarouselArrows({
	variant,
	wide,
	carousel,
}: {
	readonly variant: Variant;
	readonly wide: boolean;
	readonly carousel: RefObject<HTMLElement | null>;
}): ReactElement | null {
	const geometry = useGeometry(carousel);
	useWheel(carousel, variant !== 'B', wide);
	useArrowKeys(carousel, variant !== 'B');
	useDrag(carousel, variant === 'C');
	if (geometry === undefined || geometry.max <= 1) {
		return null;
	}
	const controls: ControlsProps = {
		geometry,
		atStart: geometry.scroll <= 1,
		atEnd: geometry.scroll >= geometry.max - 1,
		go: (direction) => {
			step(carousel.current, direction, variant === 'A' && wide);
		},
	};
	if (variant === 'A') {
		return <EdgeArrows {...controls} />;
	}
	if (variant === 'B') {
		return <PairArrows {...controls} wide={wide} />;
	}
	return <Scrollbar geometry={geometry} carousel={carousel} />;
}
