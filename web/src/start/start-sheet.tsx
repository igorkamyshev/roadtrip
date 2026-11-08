// The sheet «Откуда едем» (spec «Экран»): the city search, «Указать на карте» and «Где я» with a note under them
// when the browser gave no position.
import { useMemo, useState } from 'react';
import type { City } from '../cities/cities.ts';
import { cityFacts } from '../cities/city-card.tsx';
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

export function StartSheet({ cities, geolocationFailed, onPick, onPin, onLocate, onClose }: StartSheetProps) {
	const [text, setText] = useState('');
	const found = useMemo(() => (cities === undefined ? undefined : searchCities(cities, text)), [cities, text]);
	return (
		<Sheet title="Откуда едем" onClose={onClose}>
			<label className="search-in">
				<SearchIcon />
				<input
					type="search"
					placeholder="Город"
					aria-label="Найти город"
					// As in the prototype: the sheet opens to find a city, the keyboard comes up at once.
					autoFocus
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
			{geolocationFailed ? <p className="muted small">Браузер не дал доступ к геолокации.</p> : null}
			{found === undefined || text.trim() === '' ? null : found.length === 0 ? (
				<p className="muted small">Такого города нет в списке. В нём города от 15 000 жителей.</p>
			) : (
				<div className="found">
					{found.map((city) => (
						<button
							key={city.id}
							type="button"
							className="row found-row"
							data-testid="found-city"
							onClick={() => {
								onPick(city);
							}}
						>
							<span className="row-main">
								<span className="row-name">{city.name}</span>
								{city.local === undefined ? null : <span className="row-alt"> {city.local}</span>}
								<span className="row-sub">{cityFacts({ ...city, local: undefined })}</span>
							</span>
						</button>
					))}
				</div>
			)}
		</Sheet>
	);
}
