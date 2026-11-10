# Coding standards

Rules a reviewer checks by judgement: when a ticket's work is merged, and when a branch is reviewed as a whole. Types, tests and lint are checked by `pnpm typecheck`, `pnpm test`, `pnpm e2e` and `pnpm lint` (ADR 0002); what they check is not repeated here.

## Tests

- A package is tested at its seam ([spec #20](docs/specs/20.md), «Решения по тестам»): the engine through `computeRing` on fixtures that `data` builds, the Worker through its handlers with doubles in `deps`, the screen through Playwright on the built client. A module under a seam is tested through the seam, not by a unit test of its own.
- Only external boundaries are doubled: Sherpa, KV, R2, PostHog, the Container, time, geolocation.
- Expected values come from the spec or a worked example done by hand (an edge of 60 km on a 60 km/h road: 1 h at the wheel, 1.2 h in the ring), not recomputed the way the code computes them: not through `computeRing`, the code's own templates, or its sorting.
- An e2e test drives the page's time with `page.clock`, paused, and waits on what the page shows. A running clock only where the test needs one, with `roadtrip/clock-through-screen` disabled on its line and the reason.
- An e2e test waits for a state (the ring card's `data-state`), not for copy; only a test about the copy checks the copy.
- What belongs to one state of the screen is checked in one reading (one `expect.poll` or one call of a reading of `e2e/screen.ts`, over all its values): a reading after a poll sees a later moment (#115).
- A failing test is fixed, not deleted or skipped.
- A new test of a seam fails on the code before the change, or on a wrong way of doing it that the PR names: one that passes on both checks nothing. A guard of what stays as it was (the narrow screen, touch) passes before the change too, so it names the wrong way it catches, in its title or a comment (a hover outside `@media (--mouse)`), and the PR names it.

## Product

- Text the screen shows comes from the spec, the prototype or the ticket. A line, message or label that none of them has is a question for the Owner first. The exception is a label for screen readers (`aria-label`) that none of them has: write it, and list it in the PR's description.
- Production code takes no branch only a test takes. A test reads the page as a person does, or through an event the app sends anyway.

## Where code goes

- A function with side effects (fetch, time, KV, R2, PostHog, the Container) takes them in `deps`, built once at the Worker's entry.
- One helper per job across the packages: before writing a hash, a host check or a KV wrapper, use the one in `engine` or `worker/api`.
- A re-recorded engine fingerprint without a new `ENGINE_VERSION` claims the change cannot change any ring (`engine/AGENTS.md`): check that claim.

## Decisions and docs

- A change that contradicts an ADR in `docs/adr/` edits that ADR in the same commit.
- A one-off harness (a benchmark, a probe workflow) is deleted when its ticket ends, or runs only when asked: on `workflow_dispatch`, or on a push that changes its own request file, outside `main`.
- A change updates every README, agent doc line and code comment that describes what it changed. What it removed is found by the copy the screen showed as well as by its identifiers: «по визе» and «номера» found the comment of `worker/src/api.ts` and the lines of the spec that `EntryMark` and `platesBanned` did not (#73).
- A README line or a comment that describes a value a constant holds names the constant or a formula of it, not the value: «N, or `HOURS_PER_DAY`·D for day D», not «N, or 8·D». Then a change of the constant leaves it true. The value stays where it is the point: a test's expected value, an example query, a measurement, the glossary's definition, a line of the amendments. A change of a constant also finds those by its derived values: the 12-hour day was also «24 for day 2», «12·`MAX_DAYS`» and `--from 12 --hours 24` (#140).
- A PR's description describes its head: a commit that changes what the description says (a number, a decision, an open question) changes the description too.
- The spec, `docs/specs/20.md` (issue #20 copied when its work ended), is frozen. A change that makes a section of it untrue adds a line under that section in `docs/specs/20-amendments.md`. Untrue is what the section promises: the section that describes the changed thing gets the line, and a passing mention elsewhere that still holds in substance gets none («кнопкой «Маршрут»» in «Решение» once it became a link, #75). A line of «Решение» or of «Истории пользователей» that turns untrue is quoted in the line of the section of «Решения по реализации» that describes the thing: the amendments have no sections of their own for them (#73).
- A mention of the spec names its issue and section: `[spec #20](docs/specs/20.md) «Экран»` in Markdown (the path relative to the file), and `spec #20 «Экран»` in code, which `roadtrip/spec-names-its-issue` checks. It means the section with its amendments.
