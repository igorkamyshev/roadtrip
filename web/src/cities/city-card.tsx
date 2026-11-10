// The carousel's cards after the first one (spec #20 «Экран», «Карусель», «Карточка города»): a card per city, made
// for any point of interest, and the last card «и ещё K / Все города →». Time to the city is not on it (#19). And
// what a city says in a row of a list: the search's and the list of all.
import type { ReactElement } from 'react';
import type { Access } from 'worker/api';
import { countryName } from '../screen/countries.ts';
import type { LatLon } from '../state/point.ts';
import type { City } from './cities.ts';
import { entryMark, platesBanned, populationText, routeUrl } from './copy.ts';

export interface CityCardProps {
	readonly city: City;
	readonly origin: LatLon;
	/** The entry modes of the answer shown. */
	readonly access: Access;
	readonly citizenships: readonly string[];
	/** The chosen city: the carousel's current card, labelled larger on the map. */
	readonly chosen: boolean;
	/** A tap anywhere on the card but «Маршрут». */
	readonly onTap: () => void;
}

export function CityCard({ city, origin, access, citizenships, chosen, onTap }: CityCardProps): ReactElement {
	return (
		<div
			className={chosen ? 'c-card focus' : 'c-card'}
			data-testid="city-card"
			data-city={city.id}
			aria-current={chosen ? 'true' : undefined}
		>
			<h3>
				{/* Its tap area covers the card, and the keyboard reaches it: a card with a link in it is no button. */}
				<button type="button" className="c-card-tap" onClick={onTap}>
					{city.name}
				</button>
			</h3>
			<div className="muted small">{cityFacts(city)}</div>
			<EntryMark city={city} access={access} />
			{platesBanned(city, citizenships) ? <div className="small plates">Российские номера не пустят</div> : null}
			<div className="acts">
				{/* A quiet link, not the card's brightest thing (#75). */}
				<a className="c-route" href={routeUrl(origin, city)} target="_blank" rel="noopener noreferrer">
					Маршрут
				</a>
			</div>
		</div>
	);
}

/** «Budapest · Венгрия · 1,7 млн»: the local name when it is not the name shown, the country, the population. */
function cityFacts(city: City): string {
	return [city.local, countryName(city.zone), populationText(city.population)].filter((part) => part !== undefined).join(' · ');
}

/** A city in a row of a list: its name, the local one next to it, and under them its country and population. */
export function CityRowText({ city }: { readonly city: City }): ReactElement {
	return (
		<span className="row-main">
			<span className="row-name">{city.name}</span>
			{city.local === undefined ? null : <span className="row-alt"> {city.local}</span>}
			<span className="row-sub">{cityFacts({ ...city, local: undefined })}</span>
		</span>
	);
}

/** The badge of the city's entry mode, or nothing for a country without a visa. */
export function EntryMark({ city, access }: { readonly city: City; readonly access: Access }): ReactElement | null {
	const mark = entryMark(access[city.zone]);
	return mark === undefined ? null : (
		<div>
			<span className={`badge b-${mark.kind}`}>{mark.text}</span>
		</div>
	);
}

/** «и ещё K / Все города →»: opens the list of all the ring's cities. */
export function MoreCard({ more, onOpen }: { readonly more: number; readonly onOpen: () => void }): ReactElement {
	return (
		<button type="button" className="c-card" onClick={onOpen}>
			<span className="muted small">и ещё</span>
			<div className="big">{more}</div>
			<div className="c-more">Все города →</div>
		</button>
	);
}
