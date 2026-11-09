// The carousel at the bottom of the screen (spec #20 «Экран», «Карусель»): the first card, the cards of the ring's
// biggest cities, and «и ещё K / Все города →» when the ring holds more. Its link with the map is
// src/cities/carousel.ts's.
import type { ReactElement } from 'react';
import { CityCard, MoreCard } from '../cities/city-card.tsx';
import { FirstCard } from './first-card.tsx';
import type { ScreenModel } from './use-screen.ts';

/** The carousel's cards of cities: the biggest of the ring's, named on the map. */
export const CAROUSEL_CITIES = 12;

export function Carousel({ screen }: { readonly screen: ScreenModel }): ReactElement {
	const { state, shown, card, starts, chosen, openSheet } = screen;
	const { carousel, onCarouselScroll } = chosen;
	const { origin } = state;
	const access = shown.answer?.access;
	const cities = shown.shownCities;
	return (
		<div className="c-car" ref={carousel} onScroll={onCarouselScroll}>
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
			{origin === undefined || access === undefined
				? null
				: cities?.slice(0, CAROUSEL_CITIES).map((city) => (
						<CityCard
							key={city.id}
							city={city}
							origin={origin}
							access={access}
							citizenships={state.citizenships}
							chosen={city.id === chosen.city}
							onTap={() => {
								chosen.tapCard(city);
							}}
						/>
					))}
			{cities !== undefined && cities.length > CAROUSEL_CITIES ? (
				<MoreCard
					more={cities.length - CAROUSEL_CITIES}
					onOpen={() => {
						openSheet('cities');
					}}
				/>
			) : null}
		</div>
	);
}
