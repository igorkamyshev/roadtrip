// The screen's state from the link, and its changes: each one a `navigate` with `replace: true` (no entry in the
// browser's history per change) and the same snapshot saved in the browser. How the origin was set is not in the
// link: the screen remembers it for the session.
import { useNavigate, useRouteContext, useSearch } from '@tanstack/react-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { Start } from '../start/start.ts';
import { pointText } from './point.ts';
import { searchFromState, stateFromSearch, type ScreenState } from './search.ts';
import type { Settings } from './settings.ts';
import { writeSaved } from './startup.ts';

export interface ScreenStateControls extends ScreenState {
	/**
	 * The origin and how it was set: the opening state's origin by `link` or `saved`, then by whatever set it; an
	 * origin that came into the link otherwise (the person changed the `#…` of the open page) by `link`. Undefined
	 * without an origin. The same object while the origin and its method stay.
	 */
	readonly start: Start | undefined;
	/** The citizenships and the held visas, the same object while both stay: the rings' memory is keyed by them. */
	readonly settings: Settings;
	readonly setStart: (start: Start) => void;
	readonly setHours: (hours: number) => void;
	/** Sorted, at least one. */
	readonly setCitizenships: (citizenships: readonly string[]) => void;
	/** Sorted; none is fine. */
	readonly setVisas: (visas: readonly string[]) => void;
}

export function useScreenState(): ScreenStateControls {
	const search = useSearch({ from: '/' });
	const opening = useRouteContext({ from: '/', select: (context) => context.opening });
	const navigate = useNavigate();
	const state = stateFromSearch(search);
	// The latest state, for a change that lands after a render, such as the position from geolocation.
	const latest = useRef(state);
	latest.current = state;

	const change = useCallback(
		(patch: Partial<ScreenState>) => {
			const next = { ...latest.current, ...patch };
			latest.current = next;
			const nextSearch = searchFromState(next);
			void navigate({ to: '/', search: nextSearch, replace: true });
			writeSaved(nextSearch);
		},
		[navigate],
	);

	// How each origin of the session was set, by its text. The link catches up with a new origin after a render or
	// so, and until it does, the origin it still names keeps its own method.
	const [starts, setStarts] = useState<ReadonlyMap<string, Start>>(() => {
		const { origin } = latest.current;
		return origin === undefined || opening === 'default' ? new Map() : new Map([[pointText(origin), { method: opening, origin }]]);
	});
	const { origin } = state;
	const originText = origin === undefined ? undefined : pointText(origin);
	const start = useMemo(
		(): Start | undefined => (origin === undefined || originText === undefined ? undefined : (starts.get(originText) ?? { method: 'link', origin })),
		// Keyed by the origin's text: a new object for the same point is the same start.
		[originText, starts],
	);

	const setStart = useCallback(
		(next: Start) => {
			setStarts((known) => new Map(known).set(pointText(next.origin), next));
			change({ origin: next.origin });
		},
		[change],
	);
	const setHours = useCallback(
		(hours: number) => {
			change({ hours });
		},
		[change],
	);
	const setCitizenships = useCallback(
		(citizenships: readonly string[]) => {
			change({ citizenships });
		},
		[change],
	);
	const setVisas = useCallback(
		(visas: readonly string[]) => {
			change({ visas });
		},
		[change],
	);

	// The link gives new lists on every render; their text says when they change.
	const citizenshipsText = state.citizenships.join(',');
	const visasText = state.visas.join(',');
	const settings = useMemo((): Settings => ({ citizenships: state.citizenships, visas: state.visas }), [citizenshipsText, visasText]);

	return { ...state, start, settings, setStart, setHours, setCitizenships, setVisas };
}
