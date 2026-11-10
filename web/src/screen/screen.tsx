// The one screen (spec #20 «Экран», variant C of the prototype): the map under everything, the phrase over it, the
// data's sources of the first 5 s and their place, the slider at its right edge under them (one column, .c-top), the
// carousel at the bottom (the pin's bar in the pin mode), and the sheets. Its state and what changes it are
// use-screen.ts's.
import type { ReactElement } from 'react';
import { SourcesOnOpen } from './attribution.tsx';
import { Carousel } from './carousel.tsx';
import { PinBar } from './pin-bar.tsx';
import { ScreenMap } from './screen-map.tsx';
import { ScreenPhrase } from './screen-phrase.tsx';
import { ScreenSheets } from './screen-sheets.tsx';
import { Slider } from './slider.tsx';
import { useScreen } from './use-screen.ts';
import { PrototypeExtras, useWide, WideScreen } from './wide-carousel.prototype.tsx';

export function Screen(): ReactElement {
	const screen = useScreen();
	// PROTOTYPE (#99): the wide screen of #97 C, and the carousel's arrows on both.
	const wide = useWide();
	if (wide) {
		return <WideScreen screen={screen} />;
	}
	const { state, shown, starts } = screen;
	return (
		<div className="screen">
			<ScreenMap screen={screen} />
			<div className="c-top">
				<ScreenPhrase screen={screen} />
				<SourcesOnOpen />
				{state.origin !== undefined && !starts.pinning ? (
					<div className="c-vs" data-testid="slider-column">
						<Slider value={state.hours} onCommit={state.setHours} cached={shown.cachedHours} />
					</div>
				) : null}
			</div>
			{starts.pinning ? <PinBar onCancel={starts.cancelPinning} onStart={starts.startHere} /> : <Carousel screen={screen} />}
			<ScreenSheets screen={screen} />
			<PrototypeExtras screen={screen} wide={false} />
		</div>
	);
}
