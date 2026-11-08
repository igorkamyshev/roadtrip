// The prototype's line icons (24×24, stroke).
import type { ReactElement, ReactNode } from 'react';

function Icon({ children }: { readonly children: ReactNode }): ReactElement {
	return (
		<svg
			viewBox="0 0 24 24"
			width="20"
			height="20"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}

export const LocateIcon = (): ReactElement => (
	<Icon>
		<circle cx="12" cy="12" r="4" />
		<path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
	</Icon>
);

export const CloseIcon = (): ReactElement => (
	<Icon>
		<path d="M6 6l12 12M18 6 6 18" />
	</Icon>
);

export const PinIcon = (): ReactElement => (
	<Icon>
		<path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
		<circle cx="12" cy="9" r="2.5" />
	</Icon>
);

export const InfoIcon = (): ReactElement => (
	<Icon>
		<circle cx="12" cy="12" r="9" />
		<path d="M12 11v6M12 7.5v.01" />
	</Icon>
);

export const SearchIcon = (): ReactElement => (
	<Icon>
		<circle cx="11" cy="11" r="7" />
		<path d="m20 20-3.5-3.5" />
	</Icon>
);

export const CheckIcon = (): ReactElement => (
	<Icon>
		<path d="m5 12 5 5 9-10" />
	</Icon>
);

export const WarnIcon = (): ReactElement => (
	<Icon>
		<path d="M12 3 2 20h20L12 3z" />
		<path d="M12 10v4M12 17v.01" />
	</Icon>
);

export const RouteIcon = (): ReactElement => (
	<Icon>
		<circle cx="6" cy="19" r="2" />
		<circle cx="18" cy="5" r="2" />
		<path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" />
	</Icon>
);

/** The pin in the middle of the map in the pin mode: filled, its tip on the point. */
export const DropPin = (): ReactElement => (
	<svg viewBox="0 0 24 24" aria-hidden="true">
		<path d="M12 22s-7-6.4-7-12.2a7 7 0 0 1 14 0C19 15.6 12 22 12 22z" />
		<circle cx="12" cy="10" r="2.6" fill="#fff" />
	</svg>
);
