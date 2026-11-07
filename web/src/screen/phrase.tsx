// The phrase over the map (spec «Экран»): «Из точки [на карте], 2–3 часа в пути. Гражданство [РФ], мои визы:
// [нет] ⓘ». Each word in brackets opens a sheet.
import type { ReactNode } from 'react';
import { hoursLong } from './copy.ts';
import { InfoIcon } from './icons.tsx';

export interface PhraseProps {
	/** The origin's label: «на карте» for now (#33: the city of the search, the nearest city); undefined without one. */
	readonly startLabel: string | undefined;
	readonly hours: number;
	/** A ring is being calculated: the spinner next to the hours. */
	readonly busy: boolean;
	readonly onStart: () => void;
	readonly onInfo: () => void;
	/**
	 * After «в пути.»: the settings' words, «Гражданство [РФ], мои визы: [нет]» (#30, #31), each a `PhraseToken`.
	 * The line «визовые правила от <дата>» (#30) goes under the phrase, as its `footer`.
	 */
	readonly settings?: ReactNode;
	readonly footer?: ReactNode;
}

export function Phrase({ startLabel, hours, busy, onStart, onInfo, settings, footer }: PhraseProps) {
	return (
		<div className="c-phrase" data-testid="phrase">
			<p>
				Из точки{' '}
				<PhraseToken onClick={onStart} wanted={startLabel === undefined}>
					{startLabel ?? 'выберите'}
				</PhraseToken>
				,{' '}
				<span className="tok static">
					{hoursLong(hours)}
					{busy ? (
						<>
							{' '}
							<span className="spin" role="status" aria-label="Считаем" />
						</>
					) : null}
				</span>{' '}
				в пути.{settings === undefined ? null : <> {settings}</>}{' '}
				<button type="button" className="c-info" onClick={onInfo} aria-label="Что важно знать">
					<InfoIcon />
				</button>
			</p>
			{footer}
		</div>
	);
}

/** A word in brackets: opens its sheet. `wanted` makes it blink red, as «выберите» without an origin. */
export function PhraseToken({ children, onClick, wanted = false }: { readonly children: ReactNode; readonly onClick: () => void; readonly wanted?: boolean }) {
	return (
		<button type="button" className={wanted ? 'tok want' : 'tok'} onClick={onClick}>
			{children}
		</button>
	);
}
