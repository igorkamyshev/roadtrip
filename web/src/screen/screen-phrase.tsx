// The screen's phrase (phrase.tsx): «Из точки [Белград], 2–3 часа в пути. Гражданство [РФ], мои визы: [нет] ⓘ», each
// word in brackets opening its sheet, and under it the date of old visa rules; on the wide screen, under the date, the
// data's sources of the first 5 s, all in one plate.
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { startLabel } from '../start/start.ts';
import { citizenshipsLabel, visasLabel } from './countries.ts';
import { Phrase, PhraseToken, VisaRulesDate } from './phrase.tsx';
import type { ScreenModel } from './use-screen.ts';

/** `sources`: the data's sources in the phrase's plate, under the date, on the wide screen (#103). */
export function ScreenPhrase({ screen, sources }: { readonly screen: ScreenModel; readonly sources: ReactNode }): ReactElement {
	const { state, shown, card, openSheet } = screen;
	const { start } = state;
	const { cities } = shown;
	const label = useMemo(() => startLabel(start, cities), [start, cities]);
	return (
		<Phrase
			startLabel={label}
			hours={state.hours}
			busy={card.kind === 'calculating'}
			onStart={() => {
				openSheet('start');
			}}
			onInfo={() => {
				openSheet('info');
			}}
			settings={
				<>
					Гражданство {/* On the wide screen the comma stays on the token's line, and «мои визы:» on one line (#103). */}
					<span className="nowrap-wide">
						<PhraseToken
							onClick={() => {
								openSheet('citizenships');
							}}
						>
							{citizenshipsLabel(state.citizenships)}
						</PhraseToken>
						,
					</span>{' '}
					<span className="nowrap-wide">мои визы:</span>{' '}
					<PhraseToken
						onClick={() => {
							openSheet('visas');
						}}
					>
						{visasLabel(state.visas)}
					</PhraseToken>
				</>
			}
			footer={
				<>
					<VisaRulesDate loadedAt={shown.answer?.visaRulesLoadedAt} />
					{sources}
				</>
			}
		/>
	);
}
