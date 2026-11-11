// The carousel's cards after the first one (spec #20 «Экран», «Карусель», «Карточка города»): a card per point of
// interest, and the last card «и ещё K / Все города →». Time to the point is not on it (#19), nor a city's local name,
// its entry mode or Russian plates (#73). And what a point says in a row of the list of all, and a city in a row of the
// search. Only these look at what a point of interest is.
import type { ReactElement } from 'react';
import type { City } from '../cities/cities.ts';
import { populationLine } from '../cities/copy.ts';
import { countryFlag, countryName } from '../screen/countries.ts';
import { pointText, type LatLon } from '../state/point.ts';
import type { PointOfInterest } from './point-of-interest.ts';

export interface PointCardProps {
	readonly point: PointOfInterest;
	readonly origin: LatLon;
	/** The chosen point of interest: its card is marked where it stands, its label larger on the map. */
	readonly chosen: boolean;
	/** A tap anywhere on the card but «Маршрут». */
	readonly onTap: () => void;
}

export function PointCard({ point, origin, chosen, onTap }: PointCardProps): ReactElement {
	return (
		<div
			className={chosen ? 'c-card clickable chosen' : 'c-card clickable'}
			data-testid="city-card"
			data-point={point.key}
			aria-current={chosen ? 'true' : undefined}
		>
			{/* The name and right after it, on its line, the flag; outside the heading, whose name is the point's. */}
			<div className="c-card-title">
				<h3>
					{/* Its tap area covers the card, and the keyboard reaches it: a card with a link in it is no button. */}
					<button type="button" className="c-card-tap" onClick={onTap}>
						{point.name}
					</button>
				</h3>{' '}
				<CountryFlag zone={point.zone} />
			</div>
			<div className="muted small" data-testid="city-facts">
				{populationLine(point.city.population)}
			</div>
			<div className="acts">
				{/* A quiet link, not the card's brightest thing (#75). */}
				<a className="c-route" href={routeUrl(origin, point)} target="_blank" rel="noopener noreferrer">
					Маршрут
				</a>
			</div>
		</div>
	);
}

/**
 * The route from the origin to the point of interest by car in Google Maps
 * (https://developers.google.com/maps/documentation/urls).
 */
function routeUrl(origin: LatLon, to: LatLon): string {
	const query = new URLSearchParams({ api: '1', origin: pointText(origin), destination: `${to.lat},${to.lon}`, travelmode: 'driving' });
	return `https://www.google.com/maps/dir/?${query.toString()}`;
}

/** The flag of the country, named for a screen reader and in a tooltip. */
function CountryFlag({ zone }: { readonly zone: string }): ReactElement {
	const country = countryName(zone);
	return (
		// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an emoji is text, not an image file: a span named as an image is how a screen reader reads it by name
		<span role="img" aria-label={country} title={country}>
			{countryFlag(zone)}
		</span>
	);
}

/** A point of interest in a row of the list of all. */
export function PointRowText({ point }: { readonly point: PointOfInterest }): ReactElement {
	return <CityRowText city={point.city} />;
}

/** A city in a row of a list, the search's or the list of all: its name with its flag, and under them its population. */
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

/** «и ещё K / Все города →»: opens the list of all the ring's points of interest. */
export function MoreCard({ more, onOpen }: { readonly more: number; readonly onOpen: () => void }): ReactElement {
	return (
		<button type="button" className="c-card clickable" onClick={onOpen}>
			<span className="muted small">и ещё</span>
			<div className="big">{more}</div>
			<div className="c-more">Все города →</div>
		</button>
	);
}
