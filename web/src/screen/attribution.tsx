// The data's sources (spec #20 «Экран»: the map's attribution and ⓘ «Что важно знать»), one line for both. They live
// behind ⓘ; OpenStreetMap's attribution guidelines want them seen when the map opens, so they also show under the
// phrase for 5 s once the screen opens, then fold into ⓘ, as the guidelines allow. Their place under the phrase stays
// when they go, so the slider under them never moves (#77). What each licence asks, with its words:
// docs/attribution.md.
import { useEffect, useState, type ReactElement } from 'react';

/** How long the sources show under the phrase once the screen opens. */
const SHOWN_ON_OPEN_MS = 5000;

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/';

/**
 * «Источники данных: OpenStreetMap, GeoNames (CC BY 4.0, с изменениями), Protomaps, ESA WorldCover (CC BY 4.0),
 * Sherpa.», each a link. ESA WorldCover is the basemap's land cover; GeoNames' cities are filtered and renamed.
 */
export function DataSources(): ReactElement {
	return (
		<>
			Источники данных: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>,{' '}
			<a href="https://www.geonames.org/">GeoNames</a> (<a href={CC_BY}>CC BY 4.0</a>, с изменениями),{' '}
			<a href="https://protomaps.com/">Protomaps</a>, <a href="https://esa-worldcover.org/">ESA WorldCover</a> (
			<a href={CC_BY}>CC BY 4.0</a>), <a href="https://www.joinsherpa.com/">Sherpa</a>.
		</>
	);
}

/** The sources under the phrase for 5 s once the screen opens; after that their place, empty. */
export function SourcesOnOpen(): ReactElement {
	const [shown, setShown] = useState(true);
	useEffect(() => {
		const timer = setTimeout(() => {
			setShown(false);
		}, SHOWN_ON_OPEN_MS);
		return () => {
			clearTimeout(timer);
		};
	}, []);
	return (
		<p className={shown ? 'c-sources' : 'c-sources gone'}>
			<DataSources />
		</p>
	);
}
