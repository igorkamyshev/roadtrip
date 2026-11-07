// The first card of the carousel: the ring's summary or the screen's state (spec «Экран», «Первая карточка, по
// состояниям»). The texts are the spec's table.
import { useEffect, useState, type ReactNode } from 'react';
import type { RingFailure } from '../ring/fetch-ring.ts';
import { hoursShort, plural } from './copy.ts';
import { LocateIcon, PinIcon } from './icons.tsx';

export type FirstCardState =
	| { readonly kind: 'no_origin'; readonly geolocationFailed: boolean }
	| { readonly kind: 'calculating'; readonly hours: number; readonly request: string }
	/** `cities`: how many cities the ring holds and in how many countries; undefined until the cities file comes. */
	| { readonly kind: 'ring'; readonly hours: number; readonly cities?: { readonly count: number; readonly countries: number } }
	| { readonly kind: 'no_cities'; readonly hours: number }
	| { readonly kind: 'empty'; readonly maxHours: number }
	| { readonly kind: 'no_roads' }
	| { readonly kind: 'no_ring' }
	/** `citizenship` as the phrase says it: «РФ», «Сербия». */
	| { readonly kind: 'visa_rules_missing'; readonly citizenship: string }
	| { readonly kind: RingFailure };

export interface FirstCardActions {
	readonly onPin: () => void;
	readonly onLocate: () => void;
	readonly onRetry: () => void;
	/** Opens the sheet «Гражданство». */
	readonly onCitizenships: () => void;
}

/** How long «Считаем…» waits before it says the calculation takes longer than usual. */
export const SLOW_AFTER_MS = 5000;

export function FirstCard({ state, actions }: { readonly state: FirstCardState; readonly actions: FirstCardActions }) {
	switch (state.kind) {
		case 'no_origin':
			// #33 puts «Город» first: the search of the sheet «Откуда едем».
			return (
				<Card>
					<h3>Откуда едем?</h3>
					<p className="muted small">
						{state.geolocationFailed ? 'Браузер не дал доступ к геолокации. ' : ''}Найдите город или укажите точку на карте.
					</p>
					<div className="acts">
						<PinButton onPin={actions.onPin} primary />
						<button type="button" className="btn" onClick={actions.onLocate} aria-label="Где я">
							<LocateIcon />
						</button>
					</div>
				</Card>
			);
		case 'calculating':
			// Keyed by the request, so that the 5 s count from its start.
			return <Calculating key={state.request} hours={state.hours} />;
		case 'ring':
			return (
				<Card>
					<span className="muted small">В кольце {hoursShort(state.hours)}</span>
					{state.cities === undefined ? null : (
						<>
							<div className="big">{state.cities.count}</div>
							<div>
								{plural(state.cities.count, ['город', 'города', 'городов'])} в {state.cities.countries}{' '}
								{plural(state.cities.countries, ['стране', 'странах', 'странах'])}
							</div>
							<p className="muted small">Листайте → самые крупные</p>
						</>
					)}
				</Card>
			);
		case 'no_cities':
			// The ring's hours too, as on the ring's card: it is the same ring, without cities.
			return (
				<Card>
					<span className="muted small">В кольце {hoursShort(state.hours)}</span>
					<h3>Городов в кольце нет</h3>
					<p className="muted small">Показываем города больше 15 000 жителей.</p>
				</Card>
			);
		case 'empty':
			// #31 adds the button «Мои визы».
			return (
				<Card>
					<h3>Дальше {state.maxHours} ч не уехать</h3>
					<p className="muted small">Дальше море или закрытые страны. Добавьте свои визы или уменьшите время.</p>
				</Card>
			);
		case 'no_roads':
			return (
				<Card>
					<h3>Рядом нет дорог</h3>
					<p className="muted small">Точка дальше 50 км от дороги. Выберите другую.</p>
					<div className="acts">
						<PinButton onPin={actions.onPin} />
					</div>
				</Card>
			);
		case 'no_ring':
			return (
				<Card>
					<h3>Кольца нет</h3>
					<p className="muted small">Отсюда посчитать не можем: эта страна или территория закрыта для всех.</p>
					<div className="acts">
						<PinButton onPin={actions.onPin} />
					</div>
				</Card>
			);
		case 'visa_rules_missing':
			return (
				<Card>
					<h3 className="err">Не удалось загрузить визовые правила для гражданства {state.citizenship}.</h3>
					<p className="muted small">Попробуйте позже или уберите это гражданство</p>
					<div className="acts">
						<button type="button" className="btn primary" onClick={actions.onCitizenships}>
							Гражданство
						</button>
					</div>
				</Card>
			);
		case 'too_many_requests':
			return (
				<Card>
					<h3 className="err">Слишком много запросов, подождите несколько секунд</h3>
					<RetryButton onRetry={actions.onRetry} />
				</Card>
			);
		case 'error':
			return (
				<Card>
					<h3 className="err">Не получилось посчитать</h3>
					<p className="muted small">Проверьте интернет и попробуйте ещё раз.</p>
					<RetryButton onRetry={actions.onRetry} />
				</Card>
			);
	}
}

function Card({ children }: { readonly children: ReactNode }) {
	return (
		<div className="c-card" data-testid="first-card">
			{children}
		</div>
	);
}

function Calculating({ hours }: { readonly hours: number }) {
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
		<Card>
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

function PinButton({ onPin, primary = false }: { readonly onPin: () => void; readonly primary?: boolean }) {
	return (
		<button type="button" className={primary ? 'btn primary' : 'btn'} onClick={onPin}>
			<PinIcon /> На карте
		</button>
	);
}

function RetryButton({ onRetry }: { readonly onRetry: () => void }) {
	return (
		<div className="acts">
			<button type="button" className="btn primary" onClick={onRetry}>
				Повторить
			</button>
		</div>
	);
}
