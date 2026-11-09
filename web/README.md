# web

The client: the one screen of the site ([spec #20](../docs/specs/20.md) «Экран», «Состояние, ссылка и память браузера»), variant C of the prototype (branch `claude/you-mshpw6`, `prototypes/screen/`, `#c`), whose layout and copy it ports. Vite, React, TanStack Router, Query and Virtual, MapLibre GL. `vite build` writes `dist/`, which the Worker `roadtrip` serves as its static assets (`worker/wrangler.jsonc`, `"assets"`) before its own routes.

## Where things are

One line per file, so that two changes of the screen seldom touch the same line.

- `src/main.tsx`:
  - PostHog on the production host (`src/analytics/`, «Analytics» below). posthog-js and the map view with MapLibre are chunks of their own, which the first paint does not wait for: the screen's chunk is 0.42 MB, 132 KB in gzip.
  - The opening state (`src/state/startup.ts`: the link, else the saved state, else the defaults), then the router (its context says where the opening state came from) and the Query client.
- `src/router.tsx`: one route `/` with hash history; `validateSearch`, `parseSearch` and `stringifySearch` from `src/state/search.ts` keep the link literal: `/#/?p=44.81760,20.45730&h=3&cit=RUS,SRB&visas=GEO,SCHENGEN`.
- `src/state/`: the state in the link and its defaults.
  - `search.ts`: the origin, N, the citizenships (Sherpa's passports sorted, `RUS` by default) and the held visas (`rules`' `HELD_VISAS` sorted, none by default and left out of the link then); anything else in `cit` or `visas` takes the default.
  - `point.ts`: the origin as a point to 5 decimals.
  - `startup.ts`: the saved snapshot.
  - `use-screen-state.ts`: the changes, each a `navigate` with `replace: true` plus the snapshot, and how the origin was set, which the link does not keep (`start`, `setStart`).
  - `settings.ts`: what besides the origin and N a ring is asked for, the citizenships and the held visas, which `useScreenState` gives as `settings`, one object while they stay.
- `src/ring/`:
  - `fetch-ring.ts`: the one place a ring request starts and ends.
  - `use-ring.ts`: the rings in TanStack Query (infinite `staleTime` and `gcTime`, no retries, the previous ring of the same origin as `placeholderData`) and the hours in memory, whose cells the slider marks.
    - A `visa_rules_missing` is no ring: once the screen asks for something else it is removed from memory, so its hours get no mark and asking for it again asks the Worker (its card says «Попробуйте позже»).
- `src/start/`: the origin.
  - `geolocation.ts`: the browser's position and why it failed.
  - `start.ts`: `Start`, the origin and how it was set (`StartMethod` `geolocation`, `search`, `pin`, `link` or `saved`, with the city of the search); `startLabel`, the phrase's label: the city of the search, «на карте» for the pin, else the origin's city, «на карте» outside the limits of every city and until the cities file comes or if it cannot.
  - `start-sheet.tsx`: «Откуда едем»: the search, «Указать на карте», «Где я» and the note when the browser gave no position.
- `src/map/`:
  - `map-view.tsx`: the map view: the pin, and the map announced to the tests.
  - `use-map.ts`: the MapLibre map, made once; the overlay kept in step with the screen; a tap on a city.
  - `camera.ts`: where the map looks: over Europe, a new origin, a new ring whole, and `MapHandle`, the centre for the pin and a city to go to.
  - `overlay.ts`: the sources and layers over the basemap, in the order the screen draws them: the hatching of closed countries, the ring, the ring's cities, the origin.
  - `basemap.ts`: the basemap's style.
- `src/cities/`: the cities in the ring (#32).
  - `cities.ts`: fetches the cities file (`/data/cities.json`, data's `build-cities`, format `data/cities-file`) once into TanStack Query (`useCitiesFile`); `biggestFirst`, the order of every list of cities.
  - `in-ring.ts`: picks the ring's cities (`citiesInRing(cities, { ring, access, origin })`: inside the MultiPolygon, by a band index of its edges, in a zone `access` opens, never the origin's city, biggest first).
  - `city-card.tsx`: the card of a city, «и ещё K / Все города →», and `CityRowText`, a city in a row of the search and of the list of all.
  - `cities-sheet.tsx`: the list of all, TanStack Virtual, rows of a fixed height.
  - `copy.ts`: population, the entry mode's mark, Russian plates in the EU by `rules/eu`, the route in Google Maps.
  - `carousel.ts`: the card in the carousel's middle when it stops, scrolling a card into it.
  - `search.ts`: `searchCities(cities, text)`, up to 8 by the start of the Russian or local name, never by a later word, case and ё aside, a hyphen as a space, bigger cities higher; `searchable`, which the sheets' filters use too.
  - `nearest.ts`: `nearestCity(cities, { lat, lon })`, by great-circle distance, no limit; its `zone` is its country.
    - `originCity`: the origin's city of GLOSSARY «Город точки старта», the city whose limits hold the origin, the nearest of several, none outside them all, by `cityAround` of `data/cities-file`, the builder's limits.
  - The origin's city (#45) is no city of the ring at any N: no card, no label on the map, no row of the list of all, and the first card, `cities_count` and `countries_count` leave it out.
    - The phrase names it for geolocation, a link and the saved state, and says «на карте» outside the limits of every city, as for the pin; `start_city` of the events stays the nearest city. The parts of a city (Zemun in Belgrade) are not in the cities file at all (`data/AGENTS.md`, «Cities file»).
- `public/basemap/`: Protomaps' fonts and sprites, served as they are (below, «Basemap»).
- `src/screen/`:
  - `screen.tsx`: lays the screen out: `screen-map.tsx` (the map view, a chunk of its own, and the cities it shows), `screen-phrase.tsx` and the slider in one column (`.c-top`, below), `carousel.tsx` (the first card, the city cards, «и ещё») or `pin-bar.tsx` in the pin mode, and `screen-sheets.tsx` (the sheet open).
  - `use-screen.ts`: the screen's state and what changes it (`useScreen`, the `ScreenModel` the parts take): the link's state, then the hooks below, and the sheet open.
  - `use-shown-ring.ts`: the ring asked for, the answer shown, the ring's cities, the hours in memory, the events.
  - `use-start-methods.ts`: geolocation, at «Где я» and on a load without an origin; the search; the pin mode.
  - `use-chosen-city.ts`: the carousel's middle card, a city tapped on the map or picked in the list; a new ring chooses none.
  - `first-card-state.ts`: the first card's state.
  - `phrase.tsx`: the phrase, with `VisaRulesDate`, «визовые правила от <дата>».
  - `attribution.tsx`: the map's attribution: `DataSources`, the line of «Что важно знать», and `SourcesOnOpen`, the same line under the phrase for 5 s once the screen opens, as OpenStreetMap's attribution guidelines want it seen before it folds into ⓘ.
  - `clock.ts`: the time to the minute, for the rules' date and today's rows of «Мои визы».
  - `slider.tsx`: N, a column of twelve cells, 1 h at the bottom, each the ring from N − 1 to N h; the chosen one blue and reading «6–7», the others N, those of the rings in memory light green and `data-cached`; a drag chooses the cell under the finger and asks for its ring when let go, a tap chooses one. Here the screen departs from the prototype, whose track and thumb it had.
  - `first-card.tsx`: the spec's table of states, each named by the card's `data-state` for the tests.
  - `sheets.tsx`: «Гражданство», «Мои визы», «Что важно знать», and `Sheet`, which every sheet is: a native `<dialog>` opened modal, so the focus stays in it and Esc, the scrim and «Закрыть» close it alike.
  - `held-visas.ts`: what each of Schengen, the USA, the UK and Canada opens: the rows of `rules/held-visas`' table acting today in UTC for the citizenships chosen, the same table and `actingExemptions` the Worker uses.
  - `countries.ts`: Russian names, `Intl.DisplayNames('ru')` by the alpha-2 of `rules/countries`, our own for `RKS` and `NX`; «РФ» in the phrase; `visaName`, «Шенген» and «США», for the phrase and the city card's «по визе: <страна>».
  - `copy.ts`: hours and plurals.
  - `icons.tsx`.
- `src/styles.css`: the prototype's CSS for variant C, its tokens on `:root` with the dark scheme; the slider's `.sl*`, its panel `.c-vs` and the column `.c-top` are ours.
  - `.c-top` holds the phrase and the slider's panel, from 12 px under the top of the screen down to 214 px over its bottom, over the carousel (#47). The panel is up to 450 px high at the bottom of the column; a longer phrase moves its top down, 8 px under the phrase at the closest, and never makes it lower than 120 px. The data's sources of the first 5 s are out of the column's layout, under the phrase: the slider stays when they go.
- `e2e/`: the screen's tests (below, «Tests») and `demo.ts`, the screen without the Worker (below, «Demo»).

## For the next tickets

- **Map layers.** `src/map/overlay.ts` says where each goes. Add sources and layers in `addOverlay`, and a `show…` function the map view calls with props.
- **The hatching.** The layer `closed-hatch` fills the zone outlines (source `zones`, fetched from `/data/zones.json`, data's `zoneOutlines`) whose code `access` of the answer shown says `closed`, by a filter (`showClosed`); without an answer with `access`, nothing. The outlines are the dataset's: `pnpm --filter data build-graph <extract> <out.graph> --outlines web/public/data/zones.json` puts them where `vite dev` and `vite build` take them (gitignored); the deploy puts the dataset's there before the build (`worker/README.md`, «Deploy»). Without the file the map has no hatching and nothing else changes.
- **The cities file** goes there too: `pnpm --filter data build-cities <graph> web/public/data/cities.json --countries RS,HU,…` for a region (`data/AGENTS.md`), the dataset's in the deploy. Without it the ring's card says «В кольце …» with no count and the carousel has no cities.
- **The phrase.** `ScreenPhrase` (`src/screen/screen-phrase.tsx`) fills it in. `Phrase` takes `settings` (after «в пути.»: «Гражданство [РФ], мои визы: [нет]», each a `PhraseToken` that opens its sheet), `footer` (`VisaRulesDate`) and `startLabel` (`startLabel()` of `src/start/start.ts`). Sheets are `Sheet`s (`src/screen/sheets.tsx`).
- **The cities (#33, #34).** `useCitiesFile()` has the cities file (`City`: id, Russian name or else local, the local name when it differs, place, population, zone), and `use-shown-ring.ts` the ring's but the origin's city (`shownCities`, undefined while the ring is an old one or the file has not come): the search (`searchCities`) and the nearest city (`nearestCity`) take the same list, #34 counts `cities_count` and `countries_count` from it as the first card does. The carousel's other points of interest would go where `CityCard` does. A city card's mark of a held visa comes from `access` of the answer (`visa`: `SCHENGEN` or an alpha-3): «по визе Шенгена», else «по визе: » and `visaName`; an `evisa` that a row of the exemptions' table gives is «оформить заранее», as any e-visa.
- **Panels over the map.** A new one joins `e2e/layout.spec.ts`, which checks that the panels are apart and on the screen of three phones.
- **Analytics.** A new event goes in `src/analytics/events.ts` (its properties) and is sent with `send` of `src/analytics/posthog.ts`, or through `ScreenAnalytics` when it needs the place (below, «Analytics»).

## Analytics

`src/analytics/` ([spec #20](../docs/specs/20.md) «Аналитика и ошибки», «Браузер»; decisions #16–#18):

- `posthog.ts` starts PostHog in `main.tsx` before anything else, and only on the production host `roadtrip.kamyshev.me`: anywhere else (`vite dev`, `vite preview`, a copy) nothing is loaded and `send` does nothing. On it, `posthog-client.ts`, posthog-js itself, comes as a chunk of its own, imported at once but not waited for by the first paint; until it is up, `send` keeps the events with the time they happened, the errors the page throws are kept and handed to it, and `fetchRing` waits for it (`analyticsStarted`), so the first ring request carries the tracing headers too. The settings are the spec's: `defaults: '2026-08-30'` (a page view only when the path changes, never for the link's `#…`, and `#…` cut from every URL in the events), `capture_exceptions`, no session recording, the proxy `https://r-rt.kamyshev.me` as `api_host`, `ui_host`, and `tracing_headers` for the production host, so the ring requests carry `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID` for the Worker's events and errors. The SDK's tracing headers and exception autocapture are bundled rather than loaded from the proxy after `init`, so the first ring request of a load carries the ids and an error while the page loads is caught.
- `events.ts`: the screen's own events and their properties, as decision #18 has them: `start set`, `geolocation failed`, `ring result`, `link opened`. Never the origin: a place is the nearest city of the cities file (`start_city`, `start_city_id`) and its country (`start_country`).
- `screen-analytics.ts` says when each goes; `use-screen-analytics.ts` feeds it from the screen (`src/screen/use-shown-ring.ts`). `link opened` goes from `main.tsx`, `geolocation failed` from the screen's failed `locate()` (`src/screen/use-start-methods.ts`).
  - `start set` and `ring result` wait for the cities file for their place (and a ring for its `cities_count` and `countries_count`, counted as the first card does), and go with the time they happened; without the file they go without them.
  - `ring result` is one for each ring asked for: the load, the slider let go (it changes N only then, so moving it sends nothing), other settings, another origin, «Повторить». A ring in memory is `memory` with `wait_ms` 0; a request ends with its answer (`source` the Worker's), its failure (`too_many_requests`, `error`), or `abandoned` when the screen asks for something else first, at once, or when the page goes away (`pagehide`), by `sendBeacon`, as everything still waiting.
- The map's container has `ph-no-deadclick` and `ph-no-rageclick`: a tap on the map changes only the canvas, and PostHog's dead clicks (once the project turns them on) took every tap for one.

### Source maps

`@posthog/rollup-plugin` in `vite.config.ts` uploads the build's source maps to PostHog, so that the stack of an error in the browser reads as the source. It runs only when the build has two variables, which Workers Builds gives the build of the Worker `roadtrip` (its trigger's build variables, not the Worker's vars):

- `POSTHOG_PERSONAL_API_KEY`: a secret, the Owner's personal key (`phx_…`) with the scope «error tracking: write». Never in the repository.
- `POSTHOG_PROJECT_ID`: `718601`, not secret.

With both, the plugin writes a chunk id into each JS file, uploads the maps under the release `roadtrip-web` of the commit's git SHA (`WORKERS_CI_COMMIT_SHA`, else `git rev-parse HEAD`) and removes the `.map` files from `dist/`: the deploy must ship exactly that `dist/`. A key PostHog refuses fails the build. Without them, as locally, in CI and in the screen tests, the plugin is left out: the build is as before and uploads nothing. The plugin runs `posthog-cli`, which downloads its binary from `releases.posthog.com` on first use (pnpm runs no install script of `@posthog/cli`).

## Older browsers

The screen runs where MapLibre 6 runs: Safari 15.4, Chrome 93, Firefox 92 and newer (`BROWSERS` in `vite.config.ts`; MapLibre's worker calls `.at()` and `Object.hasOwn`). The build lowers the syntax to them, and `older-browsers.ts` gives them what the client calls and they lack: `@vitejs/plugin-legacy` makes the polyfills (core-js, by what the bundle uses) a chunk of their own, and the page loads its entry through a small loader that takes that chunk first only in a browser without `toSorted`, `Object.groupBy` or `Promise.withResolvers`. So the client may call what `tsconfig.json`'s lib (es2024) has, and a newer browser downloads no polyfill: the first paint's budget is its (`bundle-budget.ts`). `e2e/older-browsers.spec.ts` checks both: Chromium without those methods loads the polyfills and shows the screen, and as it is asks for none.

## Basemap

`src/map/basemap.ts` ([spec #20](../docs/specs/20.md) «Экран» → «Карта»): the style of `@protomaps/basemaps` over the vector tiles of `GET /tiles/{z}/{x}/{y}`, which the Worker serves from the world's PMTiles archive (`worker/README.md`). MapLibre's attribution control is off: the screen credits the data itself (`src/screen/attribution.tsx`), as the licences want it (`docs/attribution.md`).

- The flavor is `light`, or `dark` when the page is in the dark scheme, read once when the map is made.
- Labels: Protomaps' `lang: 'ru'` writes the Russian name, else the English one, with the local name on a second line. Every label that shows a name gets `coalesce(name:ru, name)` instead: Russian, else local, on one line, countries too. The regions keep their abbreviation below z6; house numbers and road shields keep their text.
- Fonts and sprites are ours, in `public/basemap/`, from `protomaps/basemaps-assets` at `028c18f`: the v4 sprites of `light` and `dark`, and of the three fontstacks the style uses (`Noto Sans Regular`, `Medium`, `Italic`) only the glyph ranges of Latin, Greek, Cyrillic, Armenian, Georgian and punctuation: `0-255`, `256-511`, `512-767`, `768-1023`, `1024-1279`, `1280-1535`, `4096-4351`, `8192-8447` (2.2 MB; every range is 13.5 MB). MapLibre draws a character of any other range with the browser's own font, and the scripts that need shaping (Devanagari, Thai and the like) and Chinese, Japanese and Korean always. `fonts/OFL.txt` is the fonts' licence; the sprites derive from the MIT-licensed `tangrams/icons`.
- Another range or flavor: copy it from `https://raw.githubusercontent.com/protomaps/basemaps-assets/028c18f/fonts/<fontstack>/<range>.pbf` (or `sprites/v4/<flavor>{,@2x}.{json,png}`) into the same path under `public/basemap/`.

## Demo

`pnpm --filter web demo` builds the client and serves it on `:4173` (`DEMO_PORT` for another) with the screen tests' doubles of the Worker (`e2e/demo.ts`): a ring that is a square band N − 1 to N tenths of a degree around the origin, after 0.7 s; the cities of `CITIES` around Belgrade and the zones of `ZONE_OUTLINES` (`e2e/fixtures.ts`); empty tiles, so the basemap is blank. It is for looking at the screen, or showing it to the Owner, where the Worker and its Container do not run, as in a cloud session.

- Open `/#/?p=44.81760,20.45730&h=6&cit=RUS`: Belgrade, a ring with cities (at 3 h the band has none).
- For a PR's «Evidence», screenshots and the video go into a private artifact (the Artifact tool), and the PR links it: a cloud session cannot attach a file to a PR.
- In a cloud session, report its port to the app (`report_preview_port`). Where the app shows no preview, record a video instead: Playwright's `chromium.launch()`, a context with `viewport: { width: 390, height: 844 }` and `recordVideo: { dir, size: { width: 390, height: 844 } }`, the steps with `page.mouse` and pauses a person can follow, then `context.close()` writes the `.webm`; `ffmpeg -i <in>.webm -c:v libx264 -pix_fmt yuv420p <out>.mp4` makes it play on a phone. A dot that follows the pointer (an init script on `pointerdown` and `pointermove`) shows where the finger is.

## Tests

The screen's seam ([spec #20](../docs/specs/20.md) «Решения по тестам», 3) is Playwright on the built client: `e2e/*.spec.ts`. `/api/ring` is a scripted double that records each request (its headers too) and answers or holds it (`RingApi`, `e2e/ring-api.ts`), the tiles of `/tiles/` are empty vector tiles, `/data/zones.json` gets a few squares around Belgrade (`ZONE_OUTLINES`), `/data/cities.json` real cities around Belgrade (`CITIES`, or a test's own through `serveCities`), and every other host is cut off in every test (`e2e/fixtures.ts`, the `network` fixture, which records both). Under the routes, every test's context goes through a proxy where nothing listens (`e2e/offline.ts`), so a request no route answers fails in the browser: the beacons of a page already gone, which Playwright's routes miss, reach neither PostHog nor its proxy (`analytics.spec.ts` checks it); geolocation comes from the context's permissions, time from `page.clock`: a test that measures time or waits for it (the 5 s of «досчитываем», a `wait_ms`, the map's easing, PostHog's dead clicks) moves the page's clock, and none waits on real time, so they hold on a busy machine. The tests read the screen by role and text and the map by its sources, layers and the hatching's filter, never by pixels, through the MapLibre map the client announces with the event `roadtrip:map` (`MAP_EVENT` in `src/map/map-view.tsx`), which an init script of the fixtures keeps as `window.mapForTests` (`e2e/screen.ts`): the deployed build, the one tested, puts nothing on `window`. A tap on a city goes where the map projects it (`tapMap`). A locator or a reading of the screen that more than one spec needs (`phrase`, `slider`, `carousel`, `boxOf`…) lives in `e2e/screen.ts`. The layout's tests (`e2e/layout.spec.ts`) read the panels' boxes (`boundingBox`) on 360×640, 390×844 and 430×932: with the longest phrase, apart and on the screen in the normal and the pin mode; with the longest and the shortest, the slider under the phrase. `visaRules()` in the fixtures adds `access` and `visaRulesLoadedAt` to an answer.

PostHog's tests (`e2e/analytics.spec.ts`) open the same build at `https://roadtrip.kamyshev.me` (`openInProduction`): the fixtures answer that host from the preview server, so the client runs PostHog there as in production, and nothing in it knows of tests. The `posthog` fixture is PostHog behind its proxy (`PostHogDouble`, `e2e/posthog-double.ts`): it records the events the page sends, the beacons marked, answers the remote config with the project's own (`captureDeadClicks` aside) and serves the SDK's lazy scripts from the installed `posthog-js`; the page shows the SDK a person's phone, not an automated browser, whose events it drops. Leaving the page is its `pagehide` (`leave`): Playwright does not see the beacons of a page that is really gone.

PostHog takes any change of the page in the seconds after a click for its answer, so a change of the screen on a timer turns the dead click of `analytics.spec.ts` into none: its test lets the page's clock run past every such timer (the data's sources under the phrase, 5 s) before it taps, and a new timer of the screen joins them there.

The tests wait for the screen's state, not its copy: the first card's `data-state` names its state (`FirstCardState` of `src/screen/first-card.tsx`: `ring`, `no_cities`, `calculating`, `empty`, `error`…), and `expectRingCard` (`e2e/screen.ts`) waits for a ring's answer by it and the slider. A new load of the page, as after closing the tab, is `reopen` (`e2e/screen.ts`): it first waits until the open page has asked, since it was loaded, for the ring its link names: that request goes after the link and the phrase change. Only a test about a text reads the text (`CODING_STANDARDS.md`, «Tests»).

```bash
pnpm e2e                               # at the root: builds the client, serves it with `vite preview` on this checkout's port, runs Chromium
pnpm e2e ring.spec                     # one file (a regex on the path)
pnpm e2e ring.spec.ts:37               # the test at that line
pnpm e2e -g 'a key moves'              # the tests whose title matches
pnpm e2e --last-failed                 # the tests that failed in the last run
pnpm e2e --repeat-each=3 --workers=4   # a stress check: every test 3 times, 4 at once (by default half the CPUs)
E2E_PORT=4180 pnpm e2e                 # on a port of your own
pnpm --filter web dev                  # the dev server; it sends /api to the worker's `pnpm dev` on :8787 (worker/README.md)
```

- **Flags** go right after `pnpm e2e`, or after `pnpm --filter web exec playwright test`, which is the same. Not after `--`: pnpm hands the `--` on to Playwright, which then drops what follows without a word and runs every test.
- **The port** is each checkout's own, one of 20000–29999 from the path of its `web/` (`playwright.config.ts`), so checkouts on one machine, agents' worktrees, run their tests at once; `E2E_PORT` gives another. A server already there is never taken for this checkout's: the run fails and says so. Stop it, perhaps an earlier run of this checkout, or give another port.
- **A failure** is in the console in full, and left in files for a later command to read whole, rather than a rerun or the console through `tail` or `grep`, which cut it: `web/test-results/failures.md` (each failed test with its message, code and stack, then the errors outside the tests, as a port taken; `e2e/failures.ts`, the console's last line names it) and `web/test-results/<test>/error-context.md` (the error, the page's aria snapshot, the test's source). The next run empties `test-results/`.
- **A flaky test** is a race between a step and the page. Find the step with a probe first: a throwaway test that records, at that step, what the doubles have seen (`ringApi.calls.length`, say), run with `--repeat-each=200`. A stress run then shows the fix holds. A stress run alone may stay green here: a cloud session has 4 CPUs, more `--workers` than that add no load, and a race that fails once in 100 on the Owner's machine passed 500 runs in one, at `--workers=16` too.
- **The output** is Playwright's list, plus GitHub's annotations on GitHub Actions only (`GITHUB_ACTIONS`): `CI=1` changes nothing in it, and only forbids `test.only`.

`@playwright/test` is pinned to the Chromium of the environment (`PLAYWRIGHT_BROWSERS_PATH`); CI installs that browser itself (`.github/workflows/checks.yml`).
