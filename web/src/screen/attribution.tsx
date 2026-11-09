// The data's sources (spec «Экран»: the map's attribution and ⓘ «Что важно знать»), one line for both. They live
// behind ⓘ; OpenStreetMap's attribution guidelines want them seen when the map opens, so they also show under the
// phrase for 5 s once the screen opens, then fold into ⓘ, as the guidelines allow.
import { useEffect, useState, type ReactElement } from 'react';

/** How long the sources show under the phrase once the screen opens. */
const SHOWN_ON_OPEN_MS = 5000;

/** «Источники данных: OpenStreetMap, GeoNames (CC BY 4.0), Protomaps, Sherpa.», each a link. */
export function DataSources(): ReactElement {
	return (
		<>
			Источники данных: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>,{' '}
			<a href="https://www.geonames.org/">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>),{' '}
			<a href="https://protomaps.com/">Protomaps</a>, <a href="https://www.joinsherpa.com/">Sherpa</a>.
		</>
	);
}

/** The sources under the phrase for 5 s once the screen opens; nothing after. */
export function SourcesOnOpen(): ReactElement | null {
	const [shown, setShown] = useState(true);
	useEffect(() => {
		const timer = setTimeout(() => {
			setShown(false);
		}, SHOWN_ON_OPEN_MS);
		return () => {
			clearTimeout(timer);
		};
	}, []);
	return shown ? (
		<p className="c-sources">
			<DataSources />
		</p>
	) : null;
}
