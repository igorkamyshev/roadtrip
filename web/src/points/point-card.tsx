// The carousel's cards after the first one (spec #20 «Экран», «Карусель», «Карточка города»; spec #154 «Экран»): a card
// per point of interest, and the last card «и ещё K / Всё в кольце →». Time to the point is not on it (#19), nor a
// city's local name, its entry mode or Russian plates (#73). And what a point says in a row of the list of all, and a
// city in a row of the search. Only these read a point of interest's city or place.
import type { ReactElement, ReactNode } from 'react';
import type { City } from '../cities/cities.ts';
import { populationLine } from '../cities/copy.ts';
import { PLACE_TYPE_NAMES } from '../places/copy.ts';
import { countryFlag, countryName } from '../screen/countries.ts';
import { pointText, type LatLon } from '../state/point.ts';
import type { PlacePoint, PointOfInterest } from './point-of-interest.ts';

export interface PointCardProps {
	readonly point: PointOfInterest;
	readonly origin: LatLon;
	/** The chosen point of interest: its card is marked where it stands, its label larger on the map. */
	readonly chosen: boolean;
	/** A tap anywhere on the card but «Маршрут». */
	readonly onTap: () => void;
	/** A tap on «Маршрут», which opens the route itself. */
	readonly onRoute: () => void;
}

/**
 * The card of a point of interest: its name and flag, then a city's population or a place's type, and «Маршрут». A
 * place's card has a strip of its group's colour on top (styles.css, `.c-card.nature`, `.c-card.history`); a city's
 * none, so a place is told from a city at a glance.
 */
export function PointCard({ point, origin, chosen, onTap, onRoute }: PointCardProps): ReactElement {
	const classes = ['c-card', 'clickable', point.group ?? '', chosen ? 'chosen' : ''];
	return (
		<div
			className={classes.filter((name) => name !== '').join(' ')}
			data-testid="point-card"
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
			<div className="muted small" data-testid="point-facts">
				{point.kind === 'city' ? populationLine(point.city.population) : <TypeChip point={point} />}
			</div>
			<div className="acts">
				{/* A quiet link, not the card's brightest thing (#75). */}
				<a className="c-route" href={routeUrl(origin, point)} target="_blank" rel="noopener noreferrer" onClick={onRoute}>
					Маршрут
				</a>
			</div>
		</div>
	);
}

/**
 * The route from the origin to the point of interest by car in Google Maps
 * (https://developers.google.com/maps/documentation/urls): to a place's access point, not into its middle.
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

/** A place's type, a chip in its group's colour: «Озеро», «Монастырь». No icon. */
function TypeChip({ point }: { readonly point: PlacePoint }): ReactElement {
	return <span className={`type-chip ${point.group}`}>{PLACE_TYPE_NAMES[point.place.type]}</span>;
}

/** A point of interest in a row of the list of all: a city's as in the search, a place's name and flag over its type. */
export function PointRowText({ point }: { readonly point: PointOfInterest }): ReactElement {
	return point.kind === 'city' ? (
		<CityRowText city={point.city} />
	) : (
		<RowText name={point.name} zone={point.zone}>
			<TypeChip point={point} />
		</RowText>
	);
}

/** A city in a row of a list, the search's or the list of all: its name with its flag, and under them its population. */
export function CityRowText({ city }: { readonly city: City }): ReactElement {
	return (
		<RowText name={city.name} zone={city.zone}>
			{populationLine(city.population)}
		</RowText>
	);
}

/** A row's text: the name with its country's flag, and under them what the row says of it. */
function RowText({ name, zone, children }: { readonly name: string; readonly zone: string; readonly children: ReactNode }): ReactElement {
	return (
		<span className="row-main">
			<span className="row-name" data-testid="row-name">
				{name}
			</span>{' '}
			<CountryFlag zone={zone} />
			<span className="row-sub">{children}</span>
		</span>
	);
}

/** «и ещё K / Всё в кольце →»: opens the list of all the ring's points of interest. */
export function MoreCard({ more, onOpen }: { readonly more: number; readonly onOpen: () => void }): ReactElement {
	return (
		<button type="button" className="c-card clickable" onClick={onOpen}>
			<span className="muted small">и ещё</span>
			<div className="big">{more}</div>
			<div className="c-more">Всё в кольце →</div>
		</button>
	);
}
