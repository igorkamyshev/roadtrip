# web

The client: the one screen of the site (spec «Экран», «Состояние, ссылка и память браузера»), variant C of the prototype (branch `claude/you-mshpw6`, `prototypes/screen/`, `#c`), whose layout and copy it ports. Vite, React, TanStack Router, Query and Virtual, MapLibre GL. `vite build` writes `dist/`, which the Worker `roadtrip` serves as its static assets (`worker/wrangler.jsonc`, `"assets"`) before its own routes.

## Where things are

- `src/main.tsx`: the opening state (`src/state/startup.ts`: the link, else the saved state, else the defaults), then the router and the Query client.
- `src/router.tsx`: one route `/` with hash history; `validateSearch`, `parseSearch` and `stringifySearch` from `src/state/search.ts` keep the link literal: `/#/?p=44.81760,20.45730&h=3&cit=RUS,SRB`.
- `src/state/`: the state in the link and its defaults (`search.ts`: the origin, N, the citizenships, Sherpa's passports sorted, `RUS` by default; anything else in `cit` takes the default), the origin as a point to 5 decimals (`point.ts`), the saved snapshot (`startup.ts`), the changes, each a `navigate` with `replace: true` plus the snapshot (`use-screen-state.ts`), and what besides the origin and N a ring is asked for (`settings.ts`: the citizenships, and no held visas until #31).
- `src/ring/`: `fetch-ring.ts` is the one place a ring request starts and ends; `use-ring.ts` holds the rings in TanStack Query (infinite `staleTime` and `gcTime`, no retries, the previous ring of the same origin as `placeholderData`) and the hours in memory for the slider's dots.
- `src/start/geolocation.ts`: the browser's position and why it failed.
- `src/map/`: `map-view.tsx` (the MapLibre map, the camera, the pin, a tap on a city), `overlay.ts` (the sources and layers over the basemap, in the order the screen draws them: the hatching of closed countries, the ring, the ring's cities, the origin), `basemap.ts` (the basemap's style).
- `src/cities/`: the cities in the ring (#32). `cities.ts` fetches the cities file (`/data/cities.json`, data's `build-cities`, format `data/cities-file`) once into TanStack Query (`useCities`); `in-ring.ts` picks the ring's cities (`citiesInRing(cities, ring, access)`: inside the MultiPolygon, by a band index of its edges, in a zone `access` opens, biggest first); `city-card.tsx` (the card of a city and «и ещё K / Все города →»), `cities-sheet.tsx` (the list of all, TanStack Virtual, rows of a fixed height), `copy.ts` (population, the entry mode's mark, Russian plates in the EU by `rules/eu`, the route in Google Maps), `carousel.ts` (the card in the carousel's middle when it stops, scrolling a card into it).
- `public/basemap/`: Protomaps' fonts and sprites, served as they are (below, «Basemap»).
- `src/screen/`: `screen.tsx` puts the screen together and keeps the chosen city (the carousel's middle card, a city tapped on the map or picked in the list; a new ring chooses none); `phrase.tsx` (with `VisaRulesDate`, «визовые правила от <дата>»), `slider.tsx`, `first-card.tsx` (the spec's table of states), `sheets.tsx` («Откуда едем», «Гражданство», «Что важно знать»), `countries.ts` (Russian names: `Intl.DisplayNames('ru')` by the alpha-2 of `rules/countries`, our own for `RKS` and `NX`; «РФ» in the phrase), `copy.ts` (hours and plurals), `icons.tsx`.
- `src/styles.css`: the prototype's CSS for variant C, its tokens on `:root` with the dark scheme.

## For the next tickets

- **Map layers.** `src/map/overlay.ts` says where each goes. Add sources and layers in `addOverlay`, and a `show…` function the map view calls with props.
- **The hatching.** The layer `closed-hatch` fills the zone outlines (source `zones`, fetched from `/data/zones.json`, data's `zoneOutlines`) whose code `access` of the answer shown says `closed`, by a filter (`showClosed`); without an answer with `access`, nothing. The outlines are the dataset's: `pnpm --filter data build-graph <extract> <out.graph> --outlines web/public/data/zones.json` puts them where `vite dev` and `vite build` take them (gitignored); the deploy (#36) puts the dataset's there before the build. Without the file the map has no hatching and nothing else changes.
- **The cities file** goes there too: `pnpm --filter data build-cities <graph> web/public/data/cities.json --countries RS,HU,…` for a region (`data/AGENTS.md`), the dataset's in the deploy (#36). Without it the ring's card says «В кольце …» with no count and the carousel has no cities.
- **The phrase (#31, #33).** `Phrase` takes `settings` (after «в пути.»: «Гражданство [РФ]» now; #31 adds «, мои визы: [нет]», each a `PhraseToken` that opens its sheet), `footer` (`VisaRulesDate`) and `startLabel` (now «на карте» for any origin; #33: the city). Sheets are `Sheet`s (`src/screen/sheets.tsx`). #31: add `visas` to `ScreenSearch`, `STATE_PARAMS` and `ScreenState`, and to `settingsOf`.
- **The cities (#33, #34).** `useCities()` has the cities file (`City`: id, Russian name or else local, the local name when it differs, place, population, zone), and `screen.tsx` the ring's (`shownCities`, undefined while the ring is an old one or the file has not come): #33 finds the nearest city and searches the same list, #34 counts `cities_count` and `countries_count` from it as the first card does. The carousel's other points of interest would go where `CityCard` does.
- **Analytics (#34).** A request starts and ends in `fetchRing`; every change of what the screen asks for, an answer from memory included, goes through `useRing`; `startup()` says where the opening state came from and whether something was saved (`link opened`); `locate()` rejects with the reason of `geolocation failed`.

## Basemap

`src/map/basemap.ts` (spec «Экран» → «Карта»): the style of `@protomaps/basemaps` over the vector tiles of `GET /tiles/{z}/{x}/{y}`, which the Worker serves from the world's PMTiles archive (`worker/README.md`), credited «Protomaps © OpenStreetMap».

- The flavor is `light`, or `dark` when the page is in the dark scheme, read once when the map is made.
- Labels: Protomaps' `lang: 'ru'` writes the Russian name, else the English one, with the local name on a second line. Every label that shows a name gets `coalesce(name:ru, name)` instead: Russian, else local, on one line, countries too. The regions keep their abbreviation below z6; house numbers and road shields keep their text.
- Fonts and sprites are ours, in `public/basemap/`, from `protomaps/basemaps-assets` at `028c18f`: the v4 sprites of `light` and `dark`, and of the three fontstacks the style uses (`Noto Sans Regular`, `Medium`, `Italic`) only the glyph ranges of Latin, Greek, Cyrillic, Armenian, Georgian and punctuation: `0-255`, `256-511`, `512-767`, `768-1023`, `1024-1279`, `1280-1535`, `4096-4351`, `8192-8447` (2.2 MB; every range is 13.5 MB). MapLibre draws a character of any other range with the browser's own font, and the scripts that need shaping (Devanagari, Thai and the like) and Chinese, Japanese and Korean always. `fonts/OFL.txt` is the fonts' licence; the sprites derive from the MIT-licensed `tangrams/icons`.
- Another range or flavor: copy it from `https://raw.githubusercontent.com/protomaps/basemaps-assets/028c18f/fonts/<fontstack>/<range>.pbf` (or `sprites/v4/<flavor>{,@2x}.{json,png}`) into the same path under `public/basemap/`.

## Tests

The screen's seam (spec «Решения по тестам», 3) is Playwright on the built client: `e2e/*.spec.ts`. `/api/ring` is a scripted double that records each request and answers or holds it, the tiles of `/tiles/` are empty vector tiles, `/data/zones.json` gets a few squares around Belgrade (`ZONE_OUTLINES`), `/data/cities.json` real cities around Belgrade (`CITIES`, or a test's own through `serveCities`), and every other host is cut off in every test (`e2e/fixtures.ts`, the `network` fixture, which records both); geolocation comes from the context's permissions, time from `page.clock`. The tests read the screen by role and text and the map by its sources, layers and the hatching's filter, through `window.__roadtripMap` (`e2e/screen.ts`), never by pixels; a tap on a city goes where the map projects it (`tapMap`). `visaRules()` in the fixtures adds `access` and `visaRulesLoadedAt` to an answer.

```bash
pnpm e2e                                  # at the root: builds the client, serves it with `vite preview` on :4173, runs Chromium
pnpm --filter web exec playwright test e2e/ring.spec.ts   # one file
E2E_PORT=4180 pnpm e2e                    # on another port, while a second checkout runs its tests
pnpm --filter web dev                     # the dev server; it sends /api to the worker's `pnpm dev` on :8787 (worker/README.md)
```

`@playwright/test` is pinned to the Chromium of the environment (`PLAYWRIGHT_BROWSERS_PATH`); CI installs that browser itself (`.github/workflows/checks.yml`).
