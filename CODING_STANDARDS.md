# Coding standards

Rules a reviewer checks by judgement: when a ticket's work is merged, and when a branch is reviewed as a whole. Types, tests and lint are checked by `pnpm typecheck`, `pnpm test`, `pnpm e2e` and `pnpm lint` (ADR 0002); what they check is not repeated here.

## Tests

- A package is tested at its seam (spec #20, «Решения по тестам»): the engine through `computeRing` on fixtures that `data` builds, the Worker through its handlers with doubles in `deps`, the screen through Playwright on the built client. A module under a seam is tested through the seam, not by a unit test of its own.
- Only external boundaries are doubled: Sherpa, KV, R2, PostHog, the Container, time, geolocation.
- Expected values come from the spec or a worked example done by hand (an edge of 60 km on a 60 km/h road: 1 h at the wheel, 1.2 h in the ring), not recomputed the way the code computes them: not through `computeRing`, the code's own templates, or its sorting.
- An e2e test drives the page's time with `page.clock`, paused, and waits on what the page shows.
- An e2e test waits for a state (the ring card's `data-state`), not for copy; only a test about the copy checks the copy.
- A failing test is fixed, not deleted or skipped.

## Product

- Text the screen shows comes from the spec or the prototype. A line, message or label that neither has is a question for the Owner first. The exception is a label for screen readers (`aria-label`) that neither has: write it, and list it in the PR's description.
- Production code takes no branch only a test takes. A test reads the page as a person does, or through an event the app sends anyway.

## Where code goes

- A function with side effects (fetch, time, KV, R2, PostHog, the Container) takes them in `deps`, built once at the Worker's entry.
- One helper per job across the packages: before writing a hash, a host check or a KV wrapper, use the one in `engine` or `worker/api`.
- A re-recorded engine fingerprint without a new `ENGINE_VERSION` claims the change cannot change any ring (`engine/AGENTS.md`): check that claim.

## Decisions and docs

- A change that contradicts an ADR in `docs/adr/` edits that ADR in the same commit.
- A one-off harness (a benchmark, a probe workflow) is deleted when its ticket ends, or runs only on `workflow_dispatch`.
- A change updates every README and agent doc line that describes what it changed.
