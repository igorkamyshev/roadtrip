// PROTOTYPE of #98, throwaway (sheet-variant.ts): the floating bar that switches the variant. Not on the production
// host, so a stray merge cannot show it there.
import type { ReactElement } from 'react';
import { stepVariant, useVariant, VARIANTS } from './sheet-variant.ts';

export function VariantSwitcher(): ReactElement | null {
	const variant = useVariant();
	if (globalThis.location.hostname === 'roadtrip.kamyshev.me') {
		return null;
	}
	const name = VARIANTS.find((each) => each.key === variant)?.name;
	return (
		<div className="proto-switcher">
			<button
				type="button"
				aria-label="Предыдущий вариант"
				onClick={() => {
					stepVariant(-1);
				}}
			>
				←
			</button>
			<span>
				{variant} · {name}
			</span>
			<button
				type="button"
				aria-label="Следующий вариант"
				onClick={() => {
					stepVariant(1);
				}}
			>
				→
			</button>
		</div>
	);
}
