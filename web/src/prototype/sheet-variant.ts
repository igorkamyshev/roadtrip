// PROTOTYPE of #98 «Модалки вместо шторок на широком экране», throwaway: never merged into main (branch
// claude/zen-euler-rogbsy). Three variants of the five sheets as modals on a wide screen, switched by `?variant=A|B|C`
// before the link's `#`, by the floating bar (switcher.tsx), or by ← and →. A narrow screen keeps the bottom sheet in
// every variant.
import { useSyncExternalStore } from 'react';

export const VARIANTS = [
	{ key: 'A', name: 'По центру' },
	{ key: 'B', name: 'Панель справа' },
	{ key: 'C', name: 'У слова' },
] as const;

export type VariantKey = (typeof VARIANTS)[number]['key'];

/** The wide screen of #96: the window at least 720 wide and 500 high; the prototype's block at the end of styles.css repeats it. */
export const WIDE = '(min-width: 720px) and (min-height: 500px)';

function fromUrl(): VariantKey {
	const wanted = new URLSearchParams(globalThis.location.search).get('variant')?.toUpperCase();
	return VARIANTS.find((variant) => variant.key === wanted)?.key ?? 'A';
}

let current: VariantKey = fromUrl();
const listeners = new Set<() => void>();
document.documentElement.dataset.sheetVariant = current;

function setVariant(key: VariantKey): void {
	current = key;
	document.documentElement.dataset.sheetVariant = key;
	const url = new URL(globalThis.location.href);
	url.searchParams.set('variant', key);
	// The router's hash and its state stay as they are.
	globalThis.history.replaceState(globalThis.history.state, '', url);
	for (const listener of listeners) {
		listener();
	}
}

export function stepVariant(by: 1 | -1): void {
	const index = VARIANTS.findIndex((variant) => variant.key === current);
	setVariant(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length].key);
}

export function useVariant(): VariantKey {
	return useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		() => current,
	);
}

globalThis.addEventListener('keydown', (event) => {
	if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
		return;
	}
	if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable], [role="slider"]') !== null) {
		return;
	}
	if (event.key === 'ArrowRight') {
		stepVariant(1);
	} else if (event.key === 'ArrowLeft') {
		stepVariant(-1);
	}
});
