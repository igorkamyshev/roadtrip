// The screen's media queries by name, from src/media.json (spec #20 «Экран», #96): the CSS writes `@media (--wide)`,
// which the build replaces with the query of that name (customMedia of web/vite.config.ts), and the JS reads them
// here, so each query is written once. A component that renders by one takes it through `useMedia` (use-media.ts).
import media from './media.json';

/** A query of src/media.json by its name: `wide`, `mouse`, `dark`, `reduced-motion`. */
export type MediaName = keyof typeof media;

/** The query of this name, for `matchMedia`. */
export const mediaQuery = (name: MediaName): string => media[name];

/** Whether the window answers the query of this name now, for what is read once: the basemap's colours, the stripes. */
export function matchesMedia(name: MediaName): boolean {
	return matchMedia(mediaQuery(name)).matches;
}
