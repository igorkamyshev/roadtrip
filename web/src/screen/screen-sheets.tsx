// The sheet open on the screen, if any (spec #20 «Экран»): «Гражданство», «Мои визы», «Откуда едем», «Что важно знать»
// and the list of all the ring's cities. Each is a `Sheet` (sheets.tsx).
import type { ReactElement } from 'react';
import { CitiesSheet } from '../cities/cities-sheet.tsx';
import { StartSheet } from '../start/start-sheet.tsx';
import { CitizenshipSheet, InfoSheet, VisasSheet } from './sheets.tsx';
import type { ScreenModel } from './use-screen.ts';

export function ScreenSheets({ screen }: { readonly screen: ScreenModel }): ReactElement | null {
	const { state, shown, starts, chosen, sheet, closeSheet } = screen;
	if (sheet === 'citizenships') {
		return <CitizenshipSheet citizenships={state.citizenships} onChange={state.setCitizenships} onClose={closeSheet} />;
	}
	if (sheet === 'visas') {
		return <VisasSheet visas={state.visas} citizenships={state.citizenships} onChange={state.setVisas} onClose={closeSheet} />;
	}
	if (sheet === 'start') {
		return (
			<StartSheet
				cities={shown.cities}
				geolocationFailed={starts.geolocationFailed}
				onPick={starts.startFromCity}
				onPin={starts.startPinning}
				onLocate={starts.locate}
				onClose={closeSheet}
			/>
		);
	}
	if (sheet === 'info') {
		return <InfoSheet onClose={closeSheet} />;
	}
	if (sheet === 'cities' && shown.shownCities !== undefined && shown.answer !== undefined) {
		return (
			<CitiesSheet
				cities={shown.shownCities}
				hours={state.hours}
				chosen={chosen.city}
				onPick={(city) => {
					closeSheet();
					chosen.pick(city);
				}}
				onClose={closeSheet}
			/>
		);
	}
	return null;
}
