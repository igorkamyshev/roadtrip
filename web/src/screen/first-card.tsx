// The first card of the carousel: the ring's summary or the screen's state (spec #20 «Экран», «Первая карточка, по
// состояниям»). The texts are the spec's table; the state comes from first-card-state.ts.
import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import type { PointsCount } from '../points/in-ring.ts';
import type { RingFailure } from '../ring/fetch-ring.ts';
import { hoursShort, plural } from './copy.ts';
import { LocateIcon } from './icons.tsx';

export type FirstCardState =
	| { readonly kind: 'no_origin'; readonly geolocationFailed: boolean }
	| { readonly kind: 'calculating'; readonly hours: number; readonly request: string }
	/** `points`: how many points of interest the ring holds and in how many countries; undefined until the cities file comes. */
	| { readonly kind: 'ring'; readonly hours: number; readonly points?: PointsCount }
	| { readonly kind: 'no_cities' }
	| { readonly kind: 'empty'; readonly maxHours: number }
	| { readonly kind: 'no_roads' }
	| { readonly kind: 'no_ring' }
	/** `citizenship` as the phrase says it: «РФ», «Сербия». */
	| { readonly kind: 'visa_rules_missing'; readonly citizenship: string }
	| { readonly kind: RingFailure };

type StateOf<Kind extends FirstCardState['kind']> = Extract<FirstCardState, { readonly kind: Kind }>;

export interface FirstCardActions {
	/** Opens the sheet «Откуда едем», to find a city. */
	readonly onSearch: () => void;
	readonly onPin: () => void;
	readonly onLocate: () => void;
	readonly onRetry: () => void;
	/** Opens the sheet «Гражданство». */
	readonly onCitizenships: () => void;
	/** Opens the sheet «Мои визы». */
	readonly onVisas: () => void;
}

/** How long «Считаем…» waits before it says the calculation takes longer than usual. */
const SLOW_AFTER_MS = 5000;

export function FirstCard({ state, actions }: { readonly state: FirstCardState; readonly actions: FirstCardActions }): ReactElement {
	if (state.kind === 'no_origin') {
		return <NoOriginCard geolocationFailed={state.geolocationFailed} actions={actions} />;
	}
	if (state.kind === 'calculating') {
		// Keyed by the request, so that the 5 s count from its start.
		return <Calculating key={state.request} hours={state.hours} />;
	}
	if (state.kind === 'ring' || state.kind === 'no_cities') {
		return <RingCard state={state} />;
	}
	if (state.kind === 'empty' || state.kind === 'no_roads' || state.kind === 'no_ring') {
		return <NoRingCard state={state} actions={actions} />;
	}
	// The rest: the visa rules missing and the failures. A new state would not fit here, and the types would say so.
	return <FailureCard state={state} actions={actions} />;
}

/** The card; `data-state` names its state, which the screen tests wait on rather than its text (e2e/screen.ts). */
function Card({ state, children }: { readonly state: FirstCardState['kind']; readonly children: ReactNode }): ReactElement {
	return (
		<div className="c-card" data-testid="first-card" data-state={state}>
			{children}
		</div>
	);
}

/** No origin yet: a city to find, a point on the map, or where the person is. */
function NoOriginCard({
	geolocationFailed,
	actions,
}: {
	readonly geolocationFailed: boolean;
	readonly actions: FirstCardActions;
}): ReactElement {
	return (
		<Card state="no_origin">
			<h3>Откуда едем?</h3>
			<p className="muted small">
				{geolocationFailed ? 'Браузер не дал доступ к геолокации. ' : ''}Найдите город или укажите точку на карте.
			</p>
			{/* One row on a phone's card too (#106): the words share it, «Где я», an icon, is a square. */}
			<div className="acts spread">
				<SearchButton onSearch={actions.onSearch} primary />
				<PinButton onPin={actions.onPin} />
				<button type="button" className="btn square" onClick={actions.onLocate} aria-label="Где я">
					<LocateIcon />
				</button>
			</div>
		</Card>
	);
}

function Calculating({ hours }: { readonly hours: number }): ReactElement {
	const [slow, setSlow] = useState(false);
	useEffect(() => {
		const timer = setTimeout(() => {
			setSlow(true);
		}, SLOW_AFTER_MS);
		return () => {
			clearTimeout(timer);
		};
	}, []);
	return (
		<Card state="calculating">
			<span className="muted small">Кольцо {hoursShort(hours)}</span>
			<h3>
				<span className="spin" aria-hidden="true" /> Считаем…
			</h3>
			<div className="bar">
				<i />
			</div>
			{slow ? <p className="muted small">Чуть дольше обычного, досчитываем — подождите</p> : null}
		</Card>
	);
}

/** The ring's summary: its points of interest and their countries once the cities file came; or that it holds none. */
function RingCard({ state }: { readonly state: StateOf<'ring' | 'no_cities'> }): ReactElement {
	if (state.kind === 'no_cities') {
		return (
			<Card state={state.kind}>
				<h3>Городов в кольце нет</h3>
				<p className="muted small">Показываем города больше 15 000 жителей.</p>
			</Card>
		);
	}
	return (
		<Card state={state.kind}>
			<span className="muted small">В кольце {hoursShort(state.hours)}</span>
			{state.points === undefined ? null : (
				<>
					<div className="big">{state.points.count}</div>
					<div>
						{plural(state.points.count, ['город', 'города', 'городов'])} в {state.points.countries}{' '}
						{plural(state.points.countries, ['стране', 'странах', 'странах'])}
					</div>
					<p className="muted small">Листайте → самые крупные</p>
				</>
			)}
		</Card>
	);
}

/** The cards that offer another origin: the heading and the line under it. */
const ELSEWHERE: Readonly<Record<'no_roads' | 'no_ring', { readonly title: string; readonly note: string }>> = {
	no_roads: { title: 'Рядом нет дорог', note: 'Точка дальше 50 км от дороги. Выберите другую.' },
	no_ring: { title: 'Кольца нет', note: 'Отсюда посчитать не можем: эта страна или территория закрыта для всех.' },
};

/** No ring from here: N reaches nothing new (the sea or closed countries), no road is near, or all are closed out. */
function NoRingCard({
	state,
	actions,
}: {
	readonly state: StateOf<'empty' | 'no_roads' | 'no_ring'>;
	readonly actions: FirstCardActions;
}): ReactElement {
	if (state.kind === 'empty') {
		return (
			<Card state={state.kind}>
				<h3>Дальше {state.maxHours} ч не уехать</h3>
				<p className="muted small">Дальше море или закрытые страны. Добавьте свои визы или уменьшите время.</p>
				<div className="acts">
					<button type="button" className="btn" onClick={actions.onVisas}>
						Мои визы
					</button>
				</div>
			</Card>
		);
	}
	const { title, note } = ELSEWHERE[state.kind];
	return (
		<Card state={state.kind}>
			<h3>{title}</h3>
			<p className="muted small">{note}</p>
			<div className="acts">
				<SearchButton onSearch={actions.onSearch} />
				<PinButton onPin={actions.onPin} />
			</div>
		</Card>
	);
}

/** The failures «Повторить» asks again for: the heading and, for some, a line under it. */
const FAILURES: Readonly<Record<RingFailure, { readonly title: string; readonly note?: string }>> = {
	too_many_requests: { title: 'Слишком много запросов, подождите несколько секунд' },
	error: { title: 'Не получилось посчитать', note: 'Проверьте интернет и попробуйте ещё раз.' },
};

/** No ring came: the visa rules of a citizenship are missing, or the request failed. */
function FailureCard({
	state,
	actions,
}: {
	readonly state: StateOf<'visa_rules_missing' | RingFailure>;
	readonly actions: FirstCardActions;
}): ReactElement {
	if (state.kind === 'visa_rules_missing') {
		return (
			<Card state={state.kind}>
				<h3 className="err">Не удалось загрузить визовые правила для гражданства {state.citizenship}.</h3>
				<p className="muted small">Попробуйте позже или уберите это гражданство</p>
				<div className="acts">
					<button type="button" className="btn primary" onClick={actions.onCitizenships}>
						Гражданство
					</button>
				</div>
			</Card>
		);
	}
	const { title, note } = FAILURES[state.kind];
	return (
		<Card state={state.kind}>
			<h3 className="err">{title}</h3>
			{note === undefined ? null : <p className="muted small">{note}</p>}
			<div className="acts">
				<button type="button" className="btn primary" onClick={actions.onRetry}>
					Повторить
				</button>
			</div>
		</Card>
	);
}

/** «Город»: the sheet «Откуда едем», to find a city. */
function SearchButton({ onSearch, primary = false }: { readonly onSearch: () => void; readonly primary?: boolean }): ReactElement {
	return (
		<button type="button" className={primary ? 'btn primary' : 'btn'} onClick={onSearch}>
			Город
		</button>
	);
}

function PinButton({ onPin }: { readonly onPin: () => void }): ReactElement {
	return (
		<button type="button" className="btn" onClick={onPin}>
			На карте
		</button>
	);
}
