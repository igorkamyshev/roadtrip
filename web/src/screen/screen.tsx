// The one screen (spec #20 «Экран», variant C of the prototype): the map under everything, the phrase over it, the
// data's sources of the first 5 s and their place, the slider at its right edge under them (one column, .c-top), the
// carousel at the bottom (the pin's bar in the pin mode), and the sheets. On the wide screen the same elements, laid
// out by styles.css: the phrase a plate with the sources in it, the slider a row over the carousel's cards. Its state and what changes it are use-screen.ts's.
import { useCallback, useRef, type ReactElement } from 'react';
import { useMedia } from '../use-media.ts';
import { SourcesOnOpen, useSourcesOnOpen } from './attribution.tsx';
import { Carousel } from './carousel.tsx';
import { PinBar } from './pin-bar.tsx';
import { ScreenMap } from './screen-map.tsx';
import { ScreenPhrase } from './screen-phrase.tsx';
import { ScreenSheets } from './screen-sheets.tsx';
import { Slider } from './slider.tsx';
import { useScreen } from './use-screen.ts';

export function Screen(): ReactElement {
	const screen = useScreen();
	const { state, shown, starts } = screen;
	// The data's sources stand under the phrase on the narrow screen and in its plate on the wide one (#103); whether
	// they still show is the screen's, so a window crossing the threshold does not show them again.
	const wide = useMedia('wide');
	const sourcesShown = useSourcesOnOpen();
	const sources = <SourcesOnOpen shown={sourcesShown} keepPlace={!wide} />;
	// The part of the wide screen no panel covers, the grid's own (styles.css, .c-free), where the camera puts a new ring
	// and a chosen city, read when it moves (#108); none on the narrow screen, whose room is the camera's.
	const free = useRef<HTMLDivElement>(null);
	const freeArea = useCallback(() => free.current?.getBoundingClientRect(), []);
	return (
		<div className="screen">
			<ScreenMap screen={screen} freeArea={freeArea} />
			{/* Right after the map: Tab goes from its canvas to the panel's buttons (#107). */}
			{starts.pinning ? <PinBar onCancel={starts.cancelPinning} onStart={starts.startHere} /> : null}
			{wide ? <div ref={free} className="c-free" aria-hidden="true" /> : null}
			<div className="c-top">
				<ScreenPhrase screen={screen} sources={wide ? sources : null} />
				{wide ? null : sources}
				{state.origin !== undefined && !starts.pinning ? (
					<div className="c-vs" data-testid="slider-column">
						<Slider value={state.hours} onCommit={state.setHours} cached={shown.cachedHours} />
					</div>
				) : null}
			</div>
			{starts.pinning ? null : <Carousel screen={screen} />}
			<ScreenSheets screen={screen} />
		</div>
	);
}
