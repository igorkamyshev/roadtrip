// The screen's state from the link, and its changes: each one a `navigate` with `replace: true` (no entry in the
// browser's history per change) and the same snapshot saved in the browser.
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useCallback, useRef } from 'react';
import type { Point } from './point.ts';
import { searchFromState, stateFromSearch, type ScreenState } from './search.ts';
import { writeSaved } from './startup.ts';

export interface ScreenStateControls extends ScreenState {
	readonly setOrigin: (origin: Point) => void;
	readonly setHours: (hours: number) => void;
}

export function useScreenState(): ScreenStateControls {
	const search = useSearch({ from: '/' });
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
	const setOrigin = useCallback((origin: Point) => {
		change({ origin });
	}, [change]);
	const setHours = useCallback((hours: number) => {
		change({ hours });
	}, [change]);

	return { ...state, setOrigin, setHours };
}
