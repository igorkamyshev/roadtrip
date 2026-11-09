// The sheets the phrase opens (spec «Экран»): «Гражданство», «Мои визы» and «Что важно знать». «Откуда едем»
// (src/start/start-sheet.tsx) and the list of all cities (src/cities/cities-sheet.tsx) are `Sheet`s too.
import { EXEMPTION_VISAS, utcDate } from 'rules/held-visas';
import { useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type Ref, type RefObject } from 'react';
import { searchable } from '../cities/search.ts';
import { DataSources } from './attribution.tsx';
import { useMinute } from './clock.ts';
import { CITIZENSHIP_CHOICES, countryName, DEFAULT_CITIZENSHIP, SINGLE_COUNTRY_VISAS, visaName } from './countries.ts';
import { opensByRows, opensText } from './held-visas.ts';
import { CheckIcon, CloseIcon, InfoIcon, SearchIcon, WarnIcon } from './icons.tsx';

export interface SheetProps {
	readonly title: string;
	/** The sheet is closed: «Закрыть», the scrim or Esc. */
	readonly onClose: () => void;
	readonly children: ReactNode;
	/** The sheet's body, which scrolls: for a virtual list inside it. */
	readonly bodyRef?: Ref<HTMLDivElement>;
	/** What has the focus when the sheet opens; by default the browser's choice, «Закрыть». */
	readonly initialFocus?: RefObject<HTMLElement | null>;
}

/**
 * A sheet: a native `<dialog>` opened modal, so the browser keeps the focus inside it, makes the screen under it inert
 * and closes it on Esc. The dialog fills the screen (styles.css, `.sheet-dialog`) and holds the scrim and the sheet.
 */
export function Sheet({ title, onClose, children, bodyRef, initialFocus }: SheetProps): ReactElement {
	const dialog = useRef<HTMLDialogElement>(null);
	// Before the effects of what is inside: the virtual list of all cities measures the open sheet.
	useLayoutEffect(() => {
		const element = dialog.current;
		if (element !== null && !element.open) {
			element.showModal();
			initialFocus?.current?.focus();
		}
	}, [initialFocus]);
	// «Закрыть», the scrim and Esc all close the dialog, and its `close` closes the sheet: one way out, and the
	// browser gives the focus back to what opened it.
	const close = (): void => {
		dialog.current?.close();
	};
	return (
		<dialog ref={dialog} className="sheet-dialog" aria-label={title} onClose={onClose}>
			{/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the scrim is for a pointer: a keyboard closes the sheet with Esc or «Закрыть» */}
			<div className="scrim" onClick={close} />
			<div className="sheet">
				<div className="sheet-head">
					<h3>{title}</h3>
					<button type="button" className="ico-btn" onClick={close} aria-label="Закрыть">
						<CloseIcon />
					</button>
				</div>
				<div className="sheet-body" ref={bodyRef}>
					{children}
				</div>
			</div>
		</dialog>
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
export function CitizenshipSheet({ citizenships, onChange, onClose }: CitizenshipSheetProps): ReactElement {
	const [filter, setFilter] = useState('');
	const wanted = searchable(filter);
	const shown = CITIZENSHIP_CHOICES.filter((code) => searchable(countryName(code)).includes(wanted));
	const toggle = (code: string): void => {
		if (!citizenships.includes(code)) {
			onChange([...citizenships, code].toSorted());
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
				{shown.map((code) => (
					<PickItem
						key={code}
						name={countryName(code)}
						sub={code === DEFAULT_CITIZENSHIP ? 'по умолчанию' : undefined}
						chosen={citizenships.includes(code)}
						onToggle={() => {
							toggle(code);
						}}
					/>
				))}
			</div>
		</Sheet>
	);
}

export interface VisasSheetProps {
	/** `SCHENGEN` and alpha-3 outside Schengen, sorted. */
	readonly visas: readonly string[];
	/** The citizenships chosen: the rows for some citizenships count only for theirs. */
	readonly citizenships: readonly string[];
	/** With the new visas, sorted; none is fine. */
	readonly onChange: (visas: readonly string[]) => void;
	readonly onClose: () => void;
}

/**
 * «Мои визы»: first Schengen and the visas that open other countries, each with what the exemptions' rows acting
 * today (in UTC: the rows count up to their last day) open for these citizenships; then «Виза одной страны», every
 * other country outside Schengen, with a filter by name. Any number may be chosen, none too. Each change asks for
 * its ring at once.
 */
export function VisasSheet({ visas, citizenships, onChange, onClose }: VisasSheetProps): ReactElement {
	const [filter, setFilter] = useState('');
	const today = utcDate(useMinute());
	const wanted = searchable(filter);
	const shown = SINGLE_COUNTRY_VISAS.filter((code) => searchable(countryName(code)).includes(wanted));
	const toggle = (code: string): void => {
		onChange(visas.includes(code) ? visas.filter((held) => held !== code) : [...visas, code].toSorted());
	};
	const item = (code: string, sub?: string): ReactElement => (
		<PickItem
			key={code}
			name={visaName(code)}
			sub={sub}
			chosen={visas.includes(code)}
			onToggle={() => {
				toggle(code);
			}}
		/>
	);
	return (
		<Sheet title="Мои визы" onClose={onClose}>
			<p className="muted small sheet-note">Визы и ВНЖ, которые у вас уже есть.</p>
			<PickSection title="Шенген и визы, которые открывают другие страны">
				{EXEMPTION_VISAS.map((visa) => item(visa, opensText(visa, opensByRows(visa, today, citizenships))))}
			</PickSection>
			<PickSection title="Виза одной страны">
				<label className="search-in">
					<SearchIcon />
					<input
						type="search"
						placeholder="Страна"
						aria-label="Найти страну"
						value={filter}
						onChange={(event) => {
							setFilter(event.target.value);
						}}
					/>
				</label>
				{shown.map((code) => item(code))}
			</PickSection>
		</Sheet>
	);
}

/** A choice of a multiple-choice sheet: a box, the name, and a line under it. */
function PickItem({
	name,
	sub,
	chosen,
	onToggle,
}: {
	readonly name: string;
	readonly sub: string | undefined;
	readonly chosen: boolean;
	readonly onToggle: () => void;
}): ReactElement {
	return (
		<button type="button" className={chosen ? 'pick-item on' : 'pick-item'} aria-pressed={chosen} onClick={onToggle}>
			<span className="pick-box">{chosen ? <CheckIcon /> : null}</span>
			<span className="row-main">
				<span className="pick-name">{name}</span>
				{sub === undefined ? null : (
					<>
						{' '}
						<span className="pick-sub">{sub}</span>
					</>
				)}
			</span>
		</button>
	);
}

/** A titled part of a multiple-choice sheet: a region named by its title. */
function PickSection({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactElement {
	const id = useId();
	return (
		<section className="pick" aria-labelledby={id}>
			<h4 className="pick-sep" id={id}>
				{title}
			</h4>
			{children}
		</section>
	);
}

/** ⓘ «Что важно знать»: the spec's list. */
export function InfoSheet({ onClose }: { readonly onClose: () => void }): ReactElement {
	return (
		<Sheet title="Что важно знать" onClose={onClose}>
			<div className="info">
				<div className="note">
					<WarnIcon />
					<span>В страны ЕС не пускают машины с российскими номерами. Если едете на такой машине, страны ЕС в кольце вам не подходят.</span>
				</div>
				<div className="note">
					<InfoIcon />
					<span>
						Визовые правила — по данным Sherpa и нашей таблицы исключений. Они меняются: перед поездкой проверьте правила въезда. Условия
						вроде многократной или уже использованной визы мы не проверяем.
					</span>
				</div>
				<div className="note">
					<InfoIcon />
					<span>
						Маршрут строят Google Карты. Они не знают, какие страны для вас закрыты, и могут повести через них. За их маршрут мы не
						отвечаем.
					</span>
				</div>
				<p className="muted small">Время в пути — время за рулём ×1,2 и по 1,5 ч на каждой границе с паспортным контролем.</p>
				<p className="muted small">
					<DataSources />
				</p>
			</div>
		</Sheet>
	);
}
