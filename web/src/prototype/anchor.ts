// PROTOTYPE of #98, throwaway (sheet-variant.ts): variant C puts the modal at the word that opened it. The opener is
// the button last pressed (Safari does not focus a clicked button), else the focused one; a tap on the map has none,
// and the modal stands as in variant A.
import { useState, useSyncExternalStore, type CSSProperties } from 'react';
import { useVariant, WIDE } from './sheet-variant.ts';

let lastPressed: HTMLElement | null = null;

document.addEventListener(
	'pointerdown',
	(event) => {
		lastPressed = event.target instanceof Element ? event.target.closest('button, a') : null;
	},
	{ capture: true },
);
document.addEventListener(
	'keydown',
	() => {
		lastPressed = null;
	},
	{ capture: true },
);

function takeOpener(): HTMLElement | null {
	const focused = document.activeElement;
	return lastPressed ?? (focused instanceof HTMLButtonElement ? focused : null);
}

function windowSize(): string {
	return `${globalThis.innerWidth}x${globalThis.innerHeight}`;
}

const EDGE = 12;
const GAP = 12;
const WIDTH = 400;
/** Below the word when that leaves the modal this much, or more than above it. */
const ROOM_BELOW = 320;

export interface Anchored {
	readonly className: string;
	readonly style: CSSProperties | undefined;
}

/** Where variant C puts the modal now: the class and the CSS variables of `.sheet`, re-placed as the window changes. */
export function useAnchor(): Anchored {
	const [opener] = useState(takeOpener);
	const variant = useVariant();
	const size = useSyncExternalStore((listener) => {
		globalThis.addEventListener('resize', listener);
		return () => {
			globalThis.removeEventListener('resize', listener);
		};
	}, windowSize);
	if (variant !== 'C' || opener === null || !opener.isConnected || !globalThis.matchMedia(WIDE).matches) {
		return { className: '', style: undefined };
	}
	const [vw, vh] = size.split('x').map(Number);
	const rect = opener.getBoundingClientRect();
	const width = Math.min(WIDTH, vw - 2 * EDGE);
	const centre = rect.left + rect.width / 2;
	const left = Math.min(Math.max(centre - width / 2, EDGE), vw - EDGE - width);
	const roomBelow = vh - rect.bottom - GAP - EDGE;
	const roomAbove = rect.top - GAP - EDGE;
	const below = roomBelow >= ROOM_BELOW || roomBelow >= roomAbove;
	const nose = Math.min(Math.max(centre - left, 24), width - 24);
	const style: Record<string, string> = {
		'--pop-left': `${left}px`,
		'--pop-width': `${width}px`,
		'--pop-max': `${below ? roomBelow : roomAbove}px`,
		'--pop-nose': `${nose}px`,
	};
	if (below) {
		style['--pop-top'] = `${rect.bottom + GAP}px`;
	} else {
		style['--pop-bottom'] = `${vh - rect.top + GAP}px`;
	}
	return { className: below ? 'anchored below' : 'anchored above', style };
}
