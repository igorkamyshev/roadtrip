// The carousel's cards after the first one (spec #20 «Экран», «Карусель», «Карточка города»): a card per city, made
// for any point of interest, and the last card «и ещё K / Все города →». Time to the city is not on it (#19), nor
// its local name, its entry mode or Russian plates (#73). And what a city says in a row of a list: the search's and
// the list of all.
import type { ReactElement } from 'react';
import { countryFlag, countryName } from '../screen/countries.ts';
import type { LatLon } from '../state/point.ts';
import type { City } from './cities.ts';
import { populationLine, routeUrl } from './copy.ts';

export interface CityCardProps {
	readonly city: City;
	readonly origin: LatLon;
	/** The chosen city: its card is marked where it stands, its label larger on the map. */
	readonly chosen: boolean;
	/** A tap anywhere on the card but «Маршрут». */
	readonly onTap: () => void;
}

export function CityCard({ city, origin, chosen, onTap }: CityCardProps): ReactElement {
	return (
		<div
			className={chosen ? 'c-card clickable chosen' : 'c-card clickable'}
			data-testid="city-card"
			data-city={city.id}
			aria-current={chosen ? 'true' : undefined}
		>
			{/* The name and right after it, on its line, the flag; outside the heading, whose name is the city's. */}
			<div className="c-card-title">
				<h3>
					{/* Its tap area covers the card, and the keyboard reaches it: a card with a link in it is no button. */}
					<button type="button" className="c-card-tap" onClick={onTap}>
						{city.name}
					</button>
				</h3>{' '}
				<CountryFlag zone={city.zone} />
			</div>
			<div className="muted small" data-testid="city-facts">
				{populationLine(city.population)}
			</div>
			<div className="acts">
				{/* A quiet link, not the card's brightest thing (#75). */}
				<a className="c-route" href={routeUrl(origin, city)} target="_blank" rel="noopener noreferrer">
					Маршрут
				</a>
			</div>
		</div>
	);
}

/** The flag of the city's country, named for a screen reader and in a tooltip. */
function CountryFlag({ zone }: { readonly zone: string }): ReactElement {
	const country = countryName(zone);
	return (
		// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an emoji is text, not an image file: a span named as an image is how a screen reader reads it by name
		<span role="img" aria-label={country} title={country}>
			{countryFlag(zone)}
		</span>
	);
}

/** A city in a row of a list: its name with its flag, and under them its population. */
export function CityRowText({ city }: { readonly city: City }): ReactElement {
	return (
		<span className="row-main">
			<span className="row-name" data-testid="row-name">
				{city.name}
			</span>{' '}
			<CountryFlag zone={city.zone} />
			<span className="row-sub">{populationLine(city.population)}</span>
		</span>
	);
}

/** «и ещё K / Все города →»: opens the list of all the ring's cities. */
export function MoreCard({ more, onOpen }: { readonly more: number; readonly onOpen: () => void }): ReactElement {
	return (
		<button type="button" className="c-card clickable" onClick={onOpen}>
			<span className="muted small">и ещё</span>
			<div className="big">{more}</div>
			<div className="c-more">Все города →</div>
		</button>
	);
}
