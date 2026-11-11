// The sheet open on the screen, if any (spec #20 «Экран»): «Гражданство», «Мои визы», «Откуда едем», «Что важно знать»
// and the list of all the ring's points of interest. Each is a `Sheet` (sheets.tsx).
import type { ReactElement } from 'react';
import { PointsSheet } from '../points/points-sheet.tsx';
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
	if (sheet === 'points' && shown.shownPoints !== undefined) {
		return (
			<PointsSheet
				points={shown.shownPoints}
				hours={state.hours}
				chosen={chosen.key}
				onPick={(point) => {
					closeSheet();
					chosen.pick(point);
				}}
				onClose={closeSheet}
			/>
		);
	}
	return null;
}
