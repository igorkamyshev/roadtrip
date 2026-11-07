// The one screen (spec «Экран», variant C of the prototype): the map under everything, the phrase over it, the
// slider at its right edge, the carousel at the bottom, and the sheets.
import type { UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RingResponse } from 'worker/api';
import { MapView, type MapHandle } from '../map/map-view.tsx';
import { RingRequestError } from '../ring/fetch-ring.ts';
import { ringKey, useCachedHours, useRing } from '../ring/use-ring.ts';
import type { Point } from '../state/point.ts';
import { DEFAULT_SETTINGS } from '../state/settings.ts';
import { useScreenState } from '../state/use-screen-state.ts';
import { locate } from '../start/geolocation.ts';
import { FirstCard, type FirstCardState } from './first-card.tsx';
import { Phrase } from './phrase.tsx';
import { InfoSheet, StartSheet } from './sheets.tsx';
import { Slider } from './slider.tsx';

type SheetName = 'start' | 'info';

export function Screen() {
	const { origin, hours, setOrigin, setHours } = useScreenState();
	// #30, #31: the person's citizenships and held visas.
	const settings = DEFAULT_SETTINGS;
	const ring = useRing(origin, hours, settings);
	const cachedHours = useCachedHours(origin, settings);
	const map = useRef<MapHandle>(null);
	const [sheet, setSheet] = useState<SheetName>();
	const [pinning, setPinning] = useState(false);
	const [geolocationFailed, setGeolocationFailed] = useState(false);

	const locateHere = useCallback(() => {
		locate().then(
			(position) => {
				setGeolocationFailed(false);
				setSheet(undefined);
				setOrigin(position);
			},
			() => {
				setGeolocationFailed(true);
			},
		);
	}, [setOrigin]);

	// The first visit, and any load whose link and saved state have no origin: where the person is.
	const locatedOnLoad = useRef(false);
	useEffect(() => {
		if (origin === undefined && !locatedOnLoad.current) {
			locatedOnLoad.current = true;
			locateHere();
		}
	}, [origin, locateHere]);

	const startPinning = () => {
		setSheet(undefined);
		setPinning(true);
	};
	const startHere = () => {
		const center = map.current?.center();
		setPinning(false);
		if (center !== undefined) {
			setOrigin(center);
		}
	};

	// The request the screen shows: what the 5 s of «Считаем…» and the camera's fit to a new ring follow.
	const requestId = origin === undefined ? '' : JSON.stringify(ringKey(origin, hours, settings));
	const card = firstCardState(origin, hours, ring, geolocationFailed, requestId);
	const shownRing = ring.data?.outcome === 'ring' ? ring.data.ring : undefined;

	return (
		<div className="screen">
			<MapView
				ref={map}
				origin={origin}
				ring={shownRing}
				striped={ring.isPlaceholderData}
				fit={ring.isPlaceholderData || shownRing === undefined ? undefined : requestId}
				pinning={pinning}
			/>
			<Phrase
				startLabel={origin === undefined ? undefined : 'на карте'}
				hours={hours}
				busy={card.kind === 'calculating'}
				onStart={() => {
					setSheet('start');
				}}
				onInfo={() => {
					setSheet('info');
				}}
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
				// #32: the cards of the cities after the first one, and «и ещё K / Все города →».
				<div className="c-car">
					<FirstCard
						state={card}
						actions={{
							onPin: startPinning,
							onLocate: locateHere,
							onRetry: () => {
								void ring.refetch();
							},
						}}
					/>
				</div>
			)}
			{sheet === 'start' ? (
				<StartSheet
					geolocationFailed={geolocationFailed}
					onPin={startPinning}
					onLocate={locateHere}
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
			return { kind: 'ring', hours };
		case 'empty':
			return { kind: 'empty', maxHours: answer.maxHours };
		case 'no_roads':
		case 'no_ring':
			return { kind: answer.outcome };
	}
}
