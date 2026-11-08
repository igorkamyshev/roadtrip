// The carousel's cards after the first one (spec «Экран», «Карусель», «Карточка города»): a card per city, made
// for any point of interest, and the last card «и ещё K / Все города →». Time to the city is not on it (#19).
import type { Access } from 'worker/api';
import { countryName } from '../screen/countries.ts';
import { RouteIcon } from '../screen/icons.tsx';
import type { LatLon } from '../state/point.ts';
import type { City } from './cities.ts';
import { entryMark, platesBanned, populationText, routeUrl } from './copy.ts';

export interface CityCardProps {
	readonly city: City;
	readonly origin: LatLon;
	/** The entry modes of the answer shown. */
	readonly access: Access;
	readonly citizenships: readonly string[];
	/** The chosen city: in the carousel's middle, labelled larger on the map. */
	readonly chosen: boolean;
}

export function CityCard({ city, origin, access, citizenships, chosen }: CityCardProps) {
	return (
		<div className={chosen ? 'c-card focus' : 'c-card'} data-testid="city-card" data-city={city.id} aria-current={chosen ? 'true' : undefined}>
			<h3>{city.name}</h3>
			<div className="muted small">{cityFacts(city)}</div>
			<EntryMark city={city} access={access} />
			{platesBanned(city, citizenships) ? <div className="small plates">Российские номера не пустят</div> : null}
			<div className="acts">
				<a className="btn primary" href={routeUrl(origin, city)} target="_blank" rel="noopener noreferrer">
					<RouteIcon /> Маршрут
				</a>
			</div>
		</div>
	);
}

/** «Budapest · Венгрия · 1,7 млн»: the local name when it is not the name shown, the country, the population. */
export function cityFacts(city: City): string {
	return [city.local, countryName(city.zone), populationText(city.population)].filter((part) => part !== undefined).join(' · ');
}

/** The badge of the city's entry mode, or nothing for a country without a visa. */
export function EntryMark({ city, access }: { readonly city: City; readonly access: Access }) {
	const mark = entryMark(access[city.zone]);
	return mark === undefined ? null : (
		<div>
			<span className={`badge b-${mark.kind}`}>{mark.text}</span>
		</div>
	);
}

/** «и ещё K / Все города →»: opens the list of all the ring's cities. */
export function MoreCard({ more, onOpen }: { readonly more: number; readonly onOpen: () => void }) {
	return (
		<button type="button" className="c-card" onClick={onOpen}>
			<span className="muted small">и ещё</span>
			<div className="big">{more}</div>
			<div className="c-more">Все города →</div>
		</button>
	);
}
