// The sheets the phrase opens (spec «Экран»). #28: «Откуда едем» and «Что важно знать»; #30 «Гражданство», #31
// «Мои визы» and #32 the list of all cities are `Sheet`s too.
import type { ReactNode } from 'react';
import { CloseIcon, InfoIcon, LocateIcon, PinIcon, WarnIcon } from './icons.tsx';

export function Sheet({ title, onClose, children }: { readonly title: string; readonly onClose: () => void; readonly children: ReactNode }) {
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
				<div className="sheet-body">{children}</div>
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
