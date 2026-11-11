// PROTOTYPE (#148), throwaway branch only: how a place shows in the carousel and in the list of all, by variant.
// A: the type's icon (Maki/Temaki) in a round badge before the name, the type under it.
// B: no icon; a strip on top of the card and a chip with the type, green for nature, terracotta for history.
// C: a square picture of the type's emoji on the left, the name and the type on the right; the route to its access point.
import type { ReactElement } from 'react';
import type { City } from '../cities/cities.ts';
import { routeUrl } from '../cities/copy.ts';
import { countryFlag, countryName } from '../screen/countries.ts';
import { plural } from '../screen/copy.ts';
import type { LatLon } from '../state/point.ts';
import { groupOf, TYPE_EMOJI, TYPE_NAMES, VARIANT, type PlaceFacts, type PlaceType, type Variant } from './places-prototype.ts';
import { TYPE_ICON_PATHS } from './type-icons.ts';

function TypeIcon({ type, size }: { readonly type: PlaceType; readonly size: number }): ReactElement {
	return (
		<svg className="pp-icon" width={size} height={size} viewBox="0 0 15 15" aria-hidden="true">
			<path d={TYPE_ICON_PATHS[type]} fillRule="evenodd" />
		</svg>
	);
}

/** The place's flags: every country of the place (A, C), or only that of its access point (B). */
function Flags({ place }: { readonly place: PlaceFacts }): ReactElement {
	const zones = VARIANT === 'b' ? [...place.openZones, ...place.zones].slice(0, 1) : place.zones;
	const names = zones.map((zone) => countryName(zone)).join(', ');
	return (
		// oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- an emoji is text, as the city card's flag
		<span role="img" aria-label={names} title={names}>
			{zones.map((zone) => countryFlag(zone)).join('')}
		</span>
	);
}

export interface PlaceCardProps {
	readonly point: City;
	readonly place: PlaceFacts;
	readonly origin: LatLon;
	readonly chosen: boolean;
	readonly onTap: () => void;
}

export function PlaceCard({ point, place, origin, chosen, onTap }: PlaceCardProps): ReactElement {
	const group = groupOf(place.type);
	const classes = ['c-card', 'clickable', 'pp-card', `pp-${VARIANT}`, `pp-${group}`, chosen ? 'chosen' : ''].join(' ').trim();
	const name = (
		<div className="c-card-title">
			{VARIANT === 'a' ? (
				<span className="pp-badge">
					<TypeIcon type={place.type} size={16} />
				</span>
			) : null}
			<h3>
				<button type="button" className="c-card-tap" onClick={onTap}>
					{point.name}
				</button>
			</h3>{' '}
			<Flags place={place} />
		</div>
	);
	const kind =
		VARIANT === 'b' ? (
			<div>
				<span className="pp-chip">{TYPE_NAMES[place.type]}</span>
			</div>
		) : (
			<div className="muted small" data-testid="city-facts">
				{TYPE_NAMES[place.type]}
			</div>
		);
	const route = (
		<div className="acts">
			<a className="c-route" href={routeUrl(origin, point)} target="_blank" rel="noopener noreferrer">
				Маршрут
			</a>
		</div>
	);
	return (
		<div className={classes} data-testid="city-card" data-city={point.id} aria-current={chosen ? 'true' : undefined}>
			{VARIANT === 'c' ? (
				<div className="pp-c-row">
					<div className="pp-pic" aria-hidden="true">
						{TYPE_EMOJI[place.type]}
					</div>
					<div className="pp-c-text">
						{name}
						{kind}
					</div>
				</div>
			) : (
				<>
					{name}
					{kind}
				</>
			)}
			{route}
		</div>
	);
}

/** A place in a row of the list of all. */
export function PlaceRowText({ point, place }: { readonly point: City; readonly place: PlaceFacts }): ReactElement {
	return (
		<span className={`row-main pp-row pp-${VARIANT} pp-${groupOf(place.type)}`}>
			{VARIANT === 'a' ? (
				<span className="pp-badge small">
					<TypeIcon type={place.type} size={12} />
				</span>
			) : null}
			{VARIANT === 'c' ? <span className="pp-row-emoji">{TYPE_EMOJI[place.type]} </span> : null}
			<span className="row-name" data-testid="row-name">
				{point.name}
			</span>{' '}
			<Flags place={place} />
			<span className="row-sub">
				{VARIANT === 'b' ? <span className="pp-chip">{TYPE_NAMES[place.type]}</span> : TYPE_NAMES[place.type]}
			</span>
		</span>
	);
}

/** The counts of the ring's cities and places. */
function countPoints(points: readonly City[]): { readonly cities: number; readonly places: number } {
	const places = points.filter((point) => point.place !== undefined).length;
	return { cities: points.length - places, places };
}

export function citiesWord(count: number): string {
	return plural(count, ['город', 'города', 'городов']);
}

export function placesWord(count: number): string {
	return plural(count, ['место', 'места', 'мест']);
}

/** «Все города →» by variant. */
export const MORE_LABEL: Readonly<Record<Variant, string>> = {
	a: 'Все города и места →',
	b: 'Всё в кольце →',
	c: 'Весь список →',
};

/** The list of all's title by variant. */
export function listTitle(points: readonly City[], hoursLabel: string): string {
	const { cities, places } = countPoints(points);
	if (VARIANT === 'a') {
		return `${cities} ${citiesWord(cities)} и ${places} ${placesWord(places)} в кольце ${hoursLabel}`;
	}
	if (VARIANT === 'b') {
		return `Всё в кольце ${hoursLabel}: ${points.length}`;
	}
	return `В кольце ${hoursLabel}: ${cities} ${citiesWord(cities)}, ${places} ${placesWord(places)}`;
}
