// The screen's phrase (phrase.tsx): «Из точки [Белград], 2–3 часа в пути. Гражданство [РФ], мои визы: [нет] ⓘ», each
// word in brackets opening its sheet, and under it the date of old visa rules.
import { useMemo, type ReactElement } from 'react';
import { startLabel } from '../start/start.ts';
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
				// PROTOTYPE (#103): c-settings and c-glue are hooks for the wide screen's variants (styles.css' end).
				<span className="c-settings">
					Гражданство{' '}
					<span className="c-glue">
						<PhraseToken
							onClick={() => {
								openSheet('citizenships');
							}}
						>
							{citizenshipsLabel(state.citizenships)}
						</PhraseToken>
						,
					</span>{' '}
					<span className="c-glue">мои визы:</span>{' '}
					<PhraseToken
						onClick={() => {
							openSheet('visas');
						}}
					>
						{visasLabel(state.visas)}
					</PhraseToken>
				</span>
			}
			footer={<VisaRulesDate loadedAt={shown.answer?.visaRulesLoadedAt} />}
		/>
	);
}
