// The carousel at the bottom of the screen (spec #20 «Экран», «Карусель»): the first card, the cards of the ring's most
// famous points of interest, and «и ещё K / Всё в кольце →» when the ring holds more; with a mouse, its arrows
// (carousel-arrows.tsx). Its link with the map is src/points/carousel.ts's.
import type { ReactElement } from 'react';
import { MoreCard, PointCard } from '../points/point-card.tsx';
import { CarouselArrows, useCarouselArrows } from './carousel-arrows.tsx';
import { FirstCard } from './first-card.tsx';
import type { ScreenModel } from './use-screen.ts';

/** The carousel's cards of points of interest: the most famous of the ring's, named on the map. */
export const CAROUSEL_POINTS = 12;

export function Carousel({ screen }: { readonly screen: ScreenModel }): ReactElement {
	const { state, shown, card, starts, chosen, openSheet } = screen;
	const { carousel, onCarouselScroll, onCarouselFocus } = chosen;
	const { origin } = state;
	const points = shown.shownPoints;
	const arrows = useCarouselArrows(carousel);
	return (
		<>
			{/* Before the row: its place in the screen's grid is over the cards (styles.css). */}
			<CarouselArrows arrows={arrows} />
			<div className="c-car" data-testid="carousel" ref={carousel} onScroll={onCarouselScroll} onFocus={onCarouselFocus}>
				<FirstCard
					state={card}
					actions={{
						onSearch: () => {
							openSheet('start');
						},
						onPin: starts.startPinning,
						onLocate: starts.locate,
						onRetry: shown.retry,
						onCitizenships: () => {
							openSheet('citizenships');
						},
						onVisas: () => {
							openSheet('visas');
						},
					}}
				/>
				{origin === undefined
					? null
					: points?.slice(0, CAROUSEL_POINTS).map((point) => (
							<PointCard
								key={point.key}
								point={point}
								origin={origin}
								chosen={point.key === chosen.key}
								onTap={() => {
									chosen.tapCard(point);
								}}
							/>
						))}
				{points !== undefined && points.length > CAROUSEL_POINTS ? (
					<MoreCard
						more={points.length - CAROUSEL_POINTS}
						onOpen={() => {
							openSheet('points');
						}}
					/>
				) : null}
			</div>
		</>
	);
}
