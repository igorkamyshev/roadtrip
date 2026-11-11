// PROTOTYPE (#148), throwaway branch only: the bar that switches the variant and F. Not on the production host;
// `?bar=0` hides it for screenshots.
import type { ReactElement } from 'react';
import { F, F_CHOICES, switchPrototype, VARIANT, VARIANT_NAMES, VARIANTS } from './places-prototype.ts';

const HIDDEN = window.location.host === 'roadtrip.kamyshev.me' || new URLSearchParams(window.location.search).get('bar') === '0';

export function PrototypeBar(): ReactElement | null {
	if (HIDDEN) {
		return null;
	}
	const index = VARIANTS.indexOf(VARIANT);
	const step = (by: number): void => {
		switchPrototype(VARIANTS[(index + by + VARIANTS.length) % VARIANTS.length], F);
	};
	return (
		<div className="pp-bar" data-testid="prototype-bar">
			<button
				type="button"
				className="pp-bar-btn"
				aria-label="Предыдущий вариант"
				onClick={() => {
					step(-1);
				}}
			>
				‹
			</button>
			<span className="pp-bar-name">{VARIANT_NAMES[VARIANT]}</span>
			<button
				type="button"
				className="pp-bar-btn"
				aria-label="Следующий вариант"
				onClick={() => {
					step(1);
				}}
			>
				›
			</button>
			<span className="pp-bar-f">F</span>
			{F_CHOICES.map((choice) => (
				<button
					key={choice}
					type="button"
					className={choice === F ? 'pp-bar-btn on' : 'pp-bar-btn'}
					onClick={() => {
						switchPrototype(VARIANT, choice);
					}}
				>
					{String(choice).replace('.', ',')}
				</button>
			))}
		</div>
	);
}
