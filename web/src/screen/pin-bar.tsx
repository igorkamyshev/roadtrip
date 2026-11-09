// The pin mode's bar (spec #20 «Экран»), in place of the carousel while the person moves the map under the pin.
import type { ReactElement } from 'react';

export function PinBar({ onCancel, onStart }: { readonly onCancel: () => void; readonly onStart: () => void }): ReactElement {
	return (
		<div className="c-pickbar">
			<span>Двигайте карту, чтобы поставить точку под булавку</span>
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
