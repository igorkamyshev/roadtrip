// The screen's phrase (phrase.tsx): «Из точки [Белград], 2–3 часа в пути. Гражданство [РФ], мои визы: [нет] ⓘ», each
// word in brackets opening its sheet, and under it the date of old visa rules and, for 5 s once the screen opens, the
// data's sources (attribution.tsx).
import { useMemo, type ReactElement } from 'react';
import { startLabel } from '../start/start.ts';
import { SourcesOnOpen } from './attribution.tsx';
import { citizenshipsLabel, visasLabel } from './countries.ts';
import { Phrase, PhraseToken, VisaRulesDate } from './phrase.tsx';
import type { ScreenModel } from './use-screen.ts';

export function ScreenPhrase({ screen }: { readonly screen: ScreenModel }): ReactElement {
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
					Гражданство{' '}
					<PhraseToken
						onClick={() => {
							openSheet('citizenships');
						}}
					>
						{citizenshipsLabel(state.citizenships)}
					</PhraseToken>
					, мои визы:{' '}
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
					<SourcesOnOpen />
				</>
			}
		/>
	);
}
