// The list of all the ring's cities (spec #20 «Экран», «Карусель»): a sheet, opened by «и ещё K / Все города →» or by a
// city on the map that has no card in the carousel. An 8-hour ring can hold thousands of cities, so the list is
// virtual (TanStack Virtual): only the rows in view are on the page.
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, type ReactElement } from 'react';
import { hoursShort, plural } from '../screen/copy.ts';
import { Sheet } from '../screen/sheets.tsx';
import type { City } from './cities.ts';
import { CityRowText } from './city-card.tsx';

/** A row's height in pixels, fixed so that the list needs no measuring (styles.css, `.city-row`). */
const ROW_HEIGHT = 60;

export interface CitiesSheetProps {
	/** The ring's cities, biggest first. */
	readonly cities: readonly City[];
	readonly hours: number;
	/** The chosen city: marked, and scrolled to when the list opens. */
	readonly chosen: number | undefined;
	readonly onPick: (city: City) => void;
	readonly onClose: () => void;
}

export function CitiesSheet({ cities, hours, chosen, onPick, onClose }: CitiesSheetProps): ReactElement {
	const body = useRef<HTMLDivElement>(null);
	// oxlint-disable-next-line react/incompatible-library -- the rule guards React Compiler's memoization, which this build does not run: the list renders anew as it scrolls
	const list = useVirtualizer({ count: cities.length, getScrollElement: () => body.current, estimateSize: () => ROW_HEIGHT, overscan: 6 });
	const opened = useRef(false);
	useEffect(() => {
		if (opened.current) {
			return;
		}
		opened.current = true;
		const index = cities.findIndex((city) => city.id === chosen);
		if (index > 0) {
			list.scrollToIndex(index, { align: 'center' });
		}
	}, [cities, chosen, list]);
	const title = `${cities.length} ${plural(cities.length, ['город', 'города', 'городов'])} в кольце ${hoursShort(hours)}`;
	return (
		<Sheet title={title} onClose={onClose} bodyRef={body} steady>
			<div className="city-list" style={{ height: list.getTotalSize() }}>
				{list.getVirtualItems().map((item) => {
					const city = cities[item.index];
					const isChosen = city.id === chosen;
					return (
						<button
							key={city.id}
							type="button"
							className={isChosen ? 'row city-row on' : 'row city-row'}
							data-testid="city-row"
							aria-current={isChosen ? 'true' : undefined}
							style={{ transform: `translateY(${item.start}px)` }}
							onClick={() => {
								onPick(city);
							}}
						>
							<CityRowText city={city} />
						</button>
					);
				})}
			</div>
		</Sheet>
	);
}
