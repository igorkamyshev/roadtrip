// The one screen (spec «Экран», variant C of the prototype): the map under everything, the phrase over it, the
// slider at its right edge under the phrase (one column, .c-top), the carousel at the bottom (the pin's bar in the pin mode), and the sheets. Its state and
// what changes it are use-screen.ts's.
import type { ReactElement } from 'react';
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
	return (
		<div className="screen">
			<ScreenMap screen={screen} />
			<div className="c-top">
				<ScreenPhrase screen={screen} />
				{state.origin !== undefined && !starts.pinning ? (
					<div className="c-vs">
						<Slider value={state.hours} onCommit={state.setHours} cached={shown.cachedHours} />
					</div>
				) : null}
			</div>
			{starts.pinning ? <PinBar onCancel={starts.cancelPinning} onStart={starts.startHere} /> : <Carousel screen={screen} />}
			<ScreenSheets screen={screen} />
		</div>
	);
}
