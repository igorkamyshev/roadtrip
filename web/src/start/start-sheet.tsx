// The sheet «Откуда едем» (spec #20 «Экран»): the city search, «Указать на карте» and «Где я» with a note under them
// when the browser gave no position.
import { useMemo, useRef, useState, type ReactElement } from 'react';
import type { City } from '../cities/cities.ts';
import { CityRowText } from '../points/point-card.tsx';
import { searchCities } from '../cities/search.ts';
import { LocateIcon, PinIcon, SearchIcon } from '../screen/icons.tsx';
import { Sheet } from '../screen/sheets.tsx';

export interface StartSheetProps {
	/** The cities file's cities; undefined until they come, and the search finds nothing till then. */
	readonly cities: readonly City[] | undefined;
	readonly geolocationFailed: boolean;
	/** With a city found: it becomes the origin. */
	readonly onPick: (city: City) => void;
	readonly onPin: () => void;
	readonly onLocate: () => void;
	readonly onClose: () => void;
}

export function StartSheet({ cities, geolocationFailed, onPick, onPin, onLocate, onClose }: StartSheetProps): ReactElement {
	const [text, setText] = useState('');
	const found = useMemo(() => (cities === undefined ? undefined : searchCities(cities, text)), [cities, text]);
	// As in the prototype: the sheet opens to find a city, so the search has the focus and the keyboard comes up at
	// once. The person opens this sheet themselves.
	const search = useRef<HTMLInputElement>(null);
	return (
		<Sheet title="Откуда едем" onClose={onClose} initialFocus={search}>
			<label className="search-in">
				<SearchIcon />
				<input
					ref={search}
					type="search"
					placeholder="Город"
					aria-label="Найти город"
					value={text}
					onChange={(event) => {
						setText(event.target.value);
					}}
				/>
			</label>
			<div className="chips">
				<button type="button" className="btn" onClick={onPin}>
					<PinIcon /> Указать на карте
				</button>
				<button type="button" className="btn" onClick={onLocate}>
					<LocateIcon /> Где я
				</button>
			</div>
			{geolocationFailed ? (
				<p className="muted small" data-testid="geolocation-failed">
					Браузер не дал доступ к геолокации.
				</p>
			) : null}
			{found === undefined || text.trim() === '' ? null : <Found cities={found} onPick={onPick} />}
		</Sheet>
	);
}

/** The cities found, or the note that the list has no such city. */
function Found({ cities, onPick }: { readonly cities: readonly City[]; readonly onPick: (city: City) => void }): ReactElement {
	if (cities.length === 0) {
		return <p className="muted small">Такого города нет в списке. В нём города от 15 000 жителей.</p>;
	}
	return (
		<div className="found">
			{cities.map((city) => (
				<button
					key={city.id}
					type="button"
					className="row found-row"
					data-testid="found-city"
					onClick={() => {
						onPick(city);
					}}
				>
					<CityRowText city={city} />
				</button>
			))}
		</div>
	);
}
