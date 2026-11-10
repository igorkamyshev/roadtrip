// The pin mode's panel (spec #20 «Экран», #107), in place of the carousel while the person moves the map under the
// pin: the hint, «Отмена» and «Старт здесь». In the DOM after the map, so Tab goes from the map's canvas to its
// buttons; the hint describes the canvas too (map-view.tsx).
import { useEffect, useEffectEvent, type ReactElement } from 'react';
import { useMedia } from '../use-media.ts';

/** The hint's id, the canvas's `aria-describedby` in the pin mode. */
export const PIN_HINT = 'pin-hint';

export function PinBar({ onCancel, onStart }: { readonly onCancel: () => void; readonly onStart: () => void }): ReactElement {
	const mouse = useMedia('mouse');
	useEscape(onCancel);
	return (
		<div className="c-pickbar" data-testid="pin-bar">
			<span id={PIN_HINT}>
				{mouse
					? 'Двигайте карту мышью или стрелками, чтобы поставить точку под булавку'
					: 'Двигайте карту, чтобы поставить точку под булавку'}
			</span>
			<div>
				<button type="button" className="btn" onClick={onCancel}>
					Отмена
				</button>
				<button type="button" className="btn primary" onClick={onStart}>
					Старт здесь
				</button>
			</div>
		</div>
	);
}

/** Esc anywhere on the screen is «Отмена»; in a sheet opened meanwhile it is the sheet's, which it closes. */
function useEscape(onEscape: () => void): void {
	const escape = useEffectEvent((event: KeyboardEvent) => {
		const inSheet = event.target instanceof Element && event.target.closest('dialog') !== null;
		if (event.key === 'Escape' && !inSheet) {
			onEscape();
		}
	});
	useEffect(() => {
		const onKey = (event: KeyboardEvent): void => {
			escape(event);
		};
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('keydown', onKey);
		};
	}, []);
}
