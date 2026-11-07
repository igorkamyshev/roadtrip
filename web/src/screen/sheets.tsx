// The sheets the phrase opens (spec «Экран»): «Откуда едем», «Гражданство» and «Что важно знать». #31 «Мои визы»
// and the list of all cities (src/cities/cities-sheet.tsx) are `Sheet`s too.
import { useState, type ReactNode, type Ref } from 'react';
import { CITIZENSHIP_CHOICES, countryName, DEFAULT_CITIZENSHIP } from './countries.ts';
import { CheckIcon, CloseIcon, InfoIcon, LocateIcon, PinIcon, SearchIcon, WarnIcon } from './icons.tsx';

export interface SheetProps {
	readonly title: string;
	readonly onClose: () => void;
	readonly children: ReactNode;
	/** The sheet's body, which scrolls: for a virtual list inside it. */
	readonly bodyRef?: Ref<HTMLDivElement>;
}

export function Sheet({ title, onClose, children, bodyRef }: SheetProps) {
	return (
		<>
			<div className="scrim" onClick={onClose} />
			<div className="sheet" role="dialog" aria-label={title}>
				<div className="sheet-head">
					<h3>{title}</h3>
					<button type="button" className="ico-btn" onClick={onClose} aria-label="Закрыть">
						<CloseIcon />
					</button>
				</div>
				<div className="sheet-body" ref={bodyRef}>
					{children}
				</div>
			</div>
		</>
	);
}

export interface StartSheetProps {
	readonly geolocationFailed: boolean;
	readonly onPin: () => void;
	readonly onLocate: () => void;
	readonly onClose: () => void;
}

/** «Откуда едем»: the pin and «Где я». #33 adds the city search over them. */
export function StartSheet({ geolocationFailed, onPin, onLocate, onClose }: StartSheetProps) {
	return (
		<Sheet title="Откуда едем" onClose={onClose}>
			<div className="chips">
				<button type="button" className="btn" onClick={onPin}>
					<PinIcon /> Указать на карте
				</button>
				<button type="button" className="btn" onClick={onLocate}>
					<LocateIcon /> Где я
				</button>
			</div>
			{geolocationFailed ? <p className="muted small">Браузер не дал доступ к геолокации.</p> : null}
		</Sheet>
	);
}

export interface CitizenshipSheetProps {
	/** Sorted, at least one. */
	readonly citizenships: readonly string[];
	/** With the new citizenships, sorted; never with none. */
	readonly onChange: (citizenships: readonly string[]) => void;
	readonly onClose: () => void;
}

/**
 * «Гражданство»: Sherpa's passports by name, Russian first «по умолчанию», with a filter by name. Several may be
 * chosen and at least one is: the last one chosen stays. Each change asks for its ring at once.
 */
export function CitizenshipSheet({ citizenships, onChange, onClose }: CitizenshipSheetProps) {
	const [filter, setFilter] = useState('');
	const wanted = searchable(filter.trim());
	const shown = CITIZENSHIP_CHOICES.filter((code) => searchable(countryName(code)).includes(wanted));
	const toggle = (code: string) => {
		if (!citizenships.includes(code)) {
			onChange([...citizenships, code].sort());
		} else if (citizenships.length > 1) {
			onChange(citizenships.filter((chosen) => chosen !== code));
		}
	};
	return (
		<Sheet title="Гражданство" onClose={onClose}>
			<p className="muted small sheet-note">Можно несколько: для каждой страны берём самый удобный вариант въезда.</p>
			<label className="search-in">
				<SearchIcon />
				<input
					type="search"
					placeholder="Страна"
					aria-label="Найти гражданство"
					value={filter}
					onChange={(event) => {
						setFilter(event.target.value);
					}}
				/>
			</label>
			<div className="pick">
				{shown.map((code) => {
					const chosen = citizenships.includes(code);
					return (
						<button
							key={code}
							type="button"
							className={chosen ? 'pick-item on' : 'pick-item'}
							aria-pressed={chosen}
							onClick={() => {
								toggle(code);
							}}
						>
							<span className="pick-box">{chosen ? <CheckIcon /> : null}</span>
							<span className="row-main">
								<span className="pick-name">{countryName(code)}</span>
								{code === DEFAULT_CITIZENSHIP ? (
									<>
										{' '}
										<span className="pick-sub">по умолчанию</span>
									</>
								) : null}
							</span>
						</button>
					);
				})}
			</div>
			{shown.length === 0 ? <p className="muted small">Такого гражданства нет в списке.</p> : null}
		</Sheet>
	);
}

/** A name or a filter as the filter compares them: lowercase, ё as е. */
function searchable(text: string): string {
	return text.toLowerCase().replaceAll('ё', 'е');
}

/** ⓘ «Что важно знать»: the spec's list. */
export function InfoSheet({ onClose }: { readonly onClose: () => void }) {
	return (
		<Sheet title="Что важно знать" onClose={onClose}>
			<div className="info">
				<div className="note">
					<WarnIcon />
					<span>
						В страны ЕС не пускают машины с российскими номерами. Если едете на такой машине, страны ЕС в кольце вам не
						подходят.
					</span>
				</div>
				<div className="note">
					<InfoIcon />
					<span>
						Визовые правила — по данным Sherpa и нашей таблицы исключений. Они меняются: перед поездкой проверьте правила
						въезда. Условия вроде многократной или уже использованной визы мы не проверяем.
					</span>
				</div>
				<div className="note">
					<InfoIcon />
					<span>
						Маршрут строят Google Карты. Они не знают, какие страны для вас закрыты, и могут повести через них. За их
						маршрут мы не отвечаем.
					</span>
				</div>
				<p className="muted small">Время в пути — время за рулём ×1,2 и по 1,5 ч на каждой границе с паспортным контролем.</p>
				<p className="muted small">
					Источники данных: <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>,{' '}
					<a href="https://www.geonames.org/">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>),{' '}
					<a href="https://protomaps.com/">Protomaps</a>, <a href="https://www.joinsherpa.com/">Sherpa</a>.
				</p>
			</div>
		</Sheet>
	);
}
