// The phrase over the map (spec «Экран»): «Из точки [на карте], 2–3 часа в пути. Гражданство [РФ], мои визы:
// [нет] ⓘ», and under it «визовые правила от <дата>» when they are old. Each word in brackets opens a sheet.
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
	 * After «в пути.»: the settings' words, «Гражданство [РФ]» and (#31) «, мои визы: [нет]», each a `PhraseToken`.
	 * The line «визовые правила от <дата>» (`VisaRulesDate`) goes under the phrase, as its `footer`.
	 */
	readonly settings?: ReactNode;
	readonly footer?: ReactNode;
}

export function Phrase({ startLabel, hours, busy, onStart, onInfo, settings, footer }: PhraseProps) {
	return (
		<div className="c-phrase" data-testid="phrase">
			<p>
				Из точки{' '}
				{/* The comma stays on the token's line. */}
				<span className="nowrap">
					<PhraseToken onClick={onStart} wanted={startLabel === undefined}>
						{startLabel ?? 'выберите'}
					</PhraseToken>
					,
				</span>{' '}
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

/** Visa rules older than this are dated under the phrase. */
const RULES_DATED_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * «визовые правила от 5 ноября» (spec «Экран»): the line under the phrase when the visa rules of the answer came
 * from Sherpa more than two days before `now`, with the year when it is not this year's. Nothing otherwise.
 */
export function VisaRulesDate({ loadedAt, now }: { readonly loadedAt: string | undefined; readonly now: number }) {
	const loaded = loadedAt === undefined ? Number.NaN : Date.parse(loadedAt);
	if (!(now - loaded > RULES_DATED_AFTER_MS)) {
		return null;
	}
	const sameYear = new Date(loaded).getFullYear() === new Date(now).getFullYear();
	const date = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) }).format(loaded);
	return <p className="c-rules-date">визовые правила от {date}</p>;
}

/** A word in brackets: opens its sheet. `wanted` makes it blink red, as «выберите» without an origin. */
export function PhraseToken({ children, onClick, wanted = false }: { readonly children: ReactNode; readonly onClick: () => void; readonly wanted?: boolean }) {
	return (
		<button type="button" className={wanted ? 'tok want' : 'tok'} onClick={onClick}>
			{children}
		</button>
	);
}
