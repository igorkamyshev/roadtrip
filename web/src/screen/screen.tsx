// The one screen (spec «Экран», variant C of the prototype): the map under everything, the phrase over it, the
// slider at its right edge, the carousel at the bottom, and the sheets.
import type { UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { utcDate } from 'rules/held-visas';
import type { RingResponse } from 'worker/api';
import { type City, useCities } from '../cities/cities.ts';
import { CitiesSheet } from '../cities/cities-sheet.tsx';
import { CityCard, MoreCard } from '../cities/city-card.tsx';
import { scrollToCard, useCarouselStops } from '../cities/carousel.ts';
import { citiesInRing } from '../cities/in-ring.ts';
import { MapView, type MapHandle } from '../map/map-view.tsx';
import type { MapCity } from '../map/overlay.ts';
import { RingRequestError } from '../ring/fetch-ring.ts';
import { ringKey, useCachedHours, useRing } from '../ring/use-ring.ts';
import { point, type Point } from '../state/point.ts';
import { settingsOf } from '../state/settings.ts';
import { useScreenState } from '../state/use-screen-state.ts';
import { locate } from '../start/geolocation.ts';
import { StartSheet } from '../start/start-sheet.tsx';
import { startLabel } from '../start/start.ts';
import { citizenshipsLabel, visasLabel } from './countries.ts';
import { FirstCard, type FirstCardState } from './first-card.tsx';
import { Phrase, PhraseToken, VisaRulesDate } from './phrase.tsx';
import { CitizenshipSheet, InfoSheet, VisasSheet } from './sheets.tsx';
import { Slider } from './slider.tsx';

type SheetName = 'start' | 'citizenships' | 'visas' | 'info' | 'cities';

/** The carousel's cards of cities: the biggest of the ring's, named on the map. */
const CAROUSEL_CITIES = 12;
/** The ring's cities the map dots, the biggest: a 12-hour ring holds thousands. */
const MAP_CITIES = 250;
/** The map comes at least this close to a city picked in the list of all. */
const PICKED_CITY_ZOOM = 8;

/** The cities the map shows: the biggest of the ring's, named if they have a card, and the chosen one. */
function citiesOnMap(cities: readonly City[], chosen: number | undefined): MapCity[] {
	const shown = cities.slice(0, MAP_CITIES);
	const chosenCity = cities.find((city) => city.id === chosen);
	if (chosenCity !== undefined && !shown.includes(chosenCity)) {
		shown.push(chosenCity);
	}
	return shown.map(({ id, name, lat, lon }, index) => ({ id, name, lat, lon, label: index < CAROUSEL_CITIES || id === chosen, chosen: id === chosen }));
}

export function Screen() {
	const { origin, start, hours, citizenships, visas, setStart, setHours, setCitizenships, setVisas } = useScreenState();
	const citizenshipsText = citizenships.join(',');
	const visasText = visas.join(',');
	const settings = useMemo(
		() => settingsOf({ citizenships: citizenshipsText.split(','), visas: visasText === '' ? [] : visasText.split(',') }),
		[citizenshipsText, visasText],
	);
	const ring = useRing(origin, hours, settings);
	const cities = useCities();
	const cachedHours = useCachedHours(origin, settings);
	const map = useRef<MapHandle>(null);
	const [sheet, setSheet] = useState<SheetName>();
	const [pinning, setPinning] = useState(false);
	const [geolocationFailed, setGeolocationFailed] = useState(false);

	const located = useCallback(
		(position: Point) => {
			setGeolocationFailed(false);
			setSheet(undefined);
			setStart({ method: 'geolocation', origin: position });
		},
		[setStart],
	);
	const notLocated = useCallback(() => {
		setGeolocationFailed(true);
	}, []);
	const locateHere = useCallback(() => {
		locate().then(located, notLocated);
	}, [located, notLocated]);

	// The first visit, and any load whose link and saved state have no origin: where the person is, unless they
	// set an origin while the browser was asking.
	const currentOrigin = useRef(origin);
	currentOrigin.current = origin;
	const locatedOnLoad = useRef(false);
	useEffect(() => {
		if (origin === undefined && !locatedOnLoad.current) {
			locatedOnLoad.current = true;
			locate().then((position) => {
				if (currentOrigin.current === undefined) {
					located(position);
				}
			}, notLocated);
		}
	}, [origin, located, notLocated]);

	const openStart = () => {
		setSheet('start');
	};
	const startFromCity = (city: City) => {
		setSheet(undefined);
		setStart({ method: 'search', origin: point(city.lat, city.lon), city });
	};
	const startPinning = () => {
		setSheet(undefined);
		setPinning(true);
	};
	const startHere = () => {
		const center = map.current?.center();
		setPinning(false);
		if (center !== undefined) {
			setStart({ method: 'pin', origin: center });
		}
	};

	// The request the screen shows: what the 5 s of «Считаем…» and the camera's fit to a new ring follow.
	const requestId = origin === undefined ? '' : JSON.stringify(ringKey(origin, hours, settings));
	const shownRing = ring.data?.outcome === 'ring' ? ring.data.ring : undefined;
	// The visa rules of the answer shown: what is hatched, how old they are, and which cities are open.
	const answer = ring.data?.outcome === 'visa_rules_missing' ? undefined : ring.data;
	const access = answer?.access;
	// The ring's cities, once the ring is this request's (not an old one standing in) and the cities have come.
	const ringCities = useMemo(
		() => (cities === undefined || shownRing === undefined || access === undefined ? undefined : citiesInRing(cities, shownRing, access)),
		[cities, shownRing, access],
	);
	const shownCities = ring.isPlaceholderData ? undefined : ringCities;
	const card = firstCardState(origin, hours, ring, geolocationFailed, requestId, shownCities);

	// The chosen city: the card in the carousel's middle, a city tapped on the map or picked in the list of all. A new
	// ring chooses none and shows the carousel from its start.
	const [chosen, setChosen] = useState<number>();
	const carousel = useRef<HTMLDivElement>(null);
	useEffect(() => {
		setChosen(undefined);
		carousel.current?.scrollTo({ left: 0 });
	}, [requestId]);
	const cityById = (id: number | undefined) => (id === undefined ? undefined : shownCities?.find((city) => city.id === id));
	const onCarouselScroll = useCarouselStops(carousel, (id) => {
		setChosen(id);
		const city = cityById(id);
		if (city !== undefined) {
			map.current?.goTo(city);
		}
	});
	const tapCity = (id: number) => {
		// A city with no card in the carousel is found in the list of all.
		if (!scrollToCard(carousel.current, id)) {
			setChosen(id);
			setSheet('cities');
		}
	};
	const pickCity = (city: City) => {
		setSheet(undefined);
		// A city with a card is chosen when the carousel stops at it, which moves the map; another one here, and the
		// map comes close to it.
		if (city.id === chosen || !scrollToCard(carousel.current, city.id)) {
			setChosen(city.id);
			map.current?.goTo(city, PICKED_CITY_ZOOM);
		}
	};
	const label = useMemo(() => startLabel(start, cities), [start, cities]);
	const mapCities = useMemo(() => citiesOnMap(shownCities ?? [], chosen), [shownCities, chosen]);
	const closed = answer === undefined ? [] : Object.keys(answer.access).filter((code) => answer.access[code].mode === 'closed');
	const openCitizenships = () => {
		setSheet('citizenships');
	};
	const openVisas = () => {
		setSheet('visas');
	};

	return (
		<div className="screen">
			<MapView
				ref={map}
				origin={origin}
				ring={shownRing}
				striped={ring.isPlaceholderData}
				fit={ring.isPlaceholderData || shownRing === undefined ? undefined : requestId}
				pinning={pinning}
				closed={closed}
				cities={mapCities}
				onCity={tapCity}
			/>
			<Phrase
				startLabel={label}
				hours={hours}
				busy={card.kind === 'calculating'}
				onStart={openStart}
				onInfo={() => {
					setSheet('info');
				}}
				settings={
					<>
						Гражданство <PhraseToken onClick={openCitizenships}>{citizenshipsLabel(citizenships)}</PhraseToken>, мои визы:{' '}
						<PhraseToken onClick={openVisas}>{visasLabel(visas)}</PhraseToken>
					</>
				}
				footer={<VisaRulesDate loadedAt={answer?.visaRulesLoadedAt} now={Date.now()} />}
			/>
			{origin !== undefined && !pinning ? (
				<div className="c-vs">
					<Slider value={hours} onCommit={setHours} cached={cachedHours} />
				</div>
			) : null}
			{pinning ? (
				<div className="c-pickbar">
					<span>Двигайте карту, чтобы поставить точку под булавку</span>
					<div>
						<button
							type="button"
							className="btn"
							onClick={() => {
								setPinning(false);
							}}
						>
							Отмена
						</button>
						<button type="button" className="btn primary" onClick={startHere}>
							Старт здесь
						</button>
					</div>
				</div>
			) : (
				<div className="c-car" ref={carousel} onScroll={onCarouselScroll}>
					<FirstCard
						state={card}
						actions={{
							onPin: startPinning,
							onLocate: locateHere,
							onRetry: () => {
								void ring.refetch();
							},
							onCitizenships: openCitizenships,
							onVisas: openVisas,
						}}
					/>
					{origin !== undefined && access !== undefined
						? shownCities
								?.slice(0, CAROUSEL_CITIES)
								.map((city) => (
									<CityCard
										key={city.id}
										city={city}
										origin={origin}
										access={access}
										citizenships={citizenships}
										chosen={city.id === chosen}
									/>
								))
						: null}
					{shownCities !== undefined && shownCities.length > CAROUSEL_CITIES ? (
						<MoreCard
							more={shownCities.length - CAROUSEL_CITIES}
							onOpen={() => {
								setSheet('cities');
							}}
						/>
					) : null}
				</div>
			)}
			{sheet === 'citizenships' ? (
				<CitizenshipSheet
					citizenships={citizenships}
					onChange={setCitizenships}
					onClose={() => {
						setSheet(undefined);
					}}
				/>
			) : null}
			{sheet === 'visas' ? (
				<VisasSheet
					visas={visas}
					citizenships={citizenships}
					today={utcDate(Date.now())}
					onChange={setVisas}
					onClose={() => {
						setSheet(undefined);
					}}
				/>
			) : null}
			{sheet === 'start' ? (
				<StartSheet
					cities={cities}
					geolocationFailed={geolocationFailed}
					onPick={startFromCity}
					onPin={startPinning}
					onLocate={locateHere}
					onClose={() => {
						setSheet(undefined);
					}}
				/>
			) : null}
			{sheet === 'cities' && shownCities !== undefined && access !== undefined ? (
				<CitiesSheet
					cities={shownCities}
					hours={hours}
					access={access}
					chosen={chosen}
					onPick={pickCity}
					onClose={() => {
						setSheet(undefined);
					}}
				/>
			) : null}
			{sheet === 'info' ? (
				<InfoSheet
					onClose={() => {
						setSheet(undefined);
					}}
				/>
			) : null}
		</div>
	);
}

function firstCardState(
	origin: Point | undefined,
	hours: number,
	ring: UseQueryResult<RingResponse, RingRequestError>,
	geolocationFailed: boolean,
	request: string,
	cities: readonly City[] | undefined,
): FirstCardState {
	if (origin === undefined) {
		return { kind: 'no_origin', geolocationFailed };
	}
	if (ring.isFetching && (ring.isPlaceholderData || ring.data === undefined)) {
		return { kind: 'calculating', hours, request };
	}
	if (ring.error !== null) {
		return { kind: ring.error instanceof RingRequestError ? ring.error.failure : 'error' };
	}
	const answer = ring.data;
	if (answer === undefined) {
		return { kind: 'calculating', hours, request };
	}
	switch (answer.outcome) {
		case 'ring':
			if (cities === undefined) {
				return { kind: 'ring', hours };
			}
			return cities.length === 0
				? { kind: 'no_cities', hours }
				: { kind: 'ring', hours, cities: { count: cities.length, countries: new Set(cities.map((city) => city.zone)).size } };
		case 'empty':
			return { kind: 'empty', maxHours: answer.maxHours };
		case 'no_roads':
		case 'no_ring':
			return { kind: answer.outcome };
		case 'visa_rules_missing':
			return { kind: 'visa_rules_missing', citizenship: citizenshipsLabel([answer.missingCitizenship]) };
	}
}
