# roadtrip-error-tracking

Tail Worker that sends the errors of the roadtrip Workers to PostHog Error Tracking (the roadtrip project, US cloud). Ported from `error-tracking` in `igorkamyshev/ytc` ([spec #20](https://github.com/igorkamyshev/roadtrip/issues/20) «Аналитика и ошибки», «Ошибки сервера»). The package also holds the logger the Workers write errors with: `error-tracking/logger`.

A Worker that lists `roadtrip-error-tracking` in `tail_consumers` hands it a `TraceItem` for each of its runs. From each one, this worker sends a `$exception` event for:

- each unhandled exception (`handled: false`);
- each `console.error`, including every `logger.error` (`handled: true`). The type, message and stack come from the Error argument; without one, the event is a `LoggedError` with the log text;
- a run that ended with an outcome other than `ok` and threw nothing, such as `exceededCpu`, `exceededMemory` or `canceled`: a synthetic exception whose type is the outcome.

Some runs end `canceled` on a normal day, so for them that outcome alone sends nothing (`EXPECTED_CANCELLATIONS` in `src/trace-to-exceptions.ts`). Their failures still arrive as their own exceptions and error logs.

- The alarm of `EngineContainer`. `@cloudflare/containers` cancels it whenever the container stops, after `sleepAfter` or for a new image (ytc saw this on every stop).
- `GET /api/ring` when the person left before the answer. The browser reports such a request as `abandoned`.
- `GET /tiles/…` that MapLibre dropped as the map moved.

ytc's other entry, its Workflow, has no counterpart here. A run whose `waitUntil` work the runtime cut off after 30 s is always an error, because the background Sherpa refresh or a PostHog send hung. These entries come from how the libraries and the browser behave, not yet from prod: after launch, check the `canceled` runs in Cloudflare's invocation log against PostHog. The list names the Container class and the routes, so a rename in the Worker changes it too.

Along the way it:

- **ties the error to the browser.** The `distinct_id` and `session_id` of the `logger.error` context become the event's `distinct_id` and `$session_id`. Without a `distinct_id`, the event gets a one-off one. No event creates a person (`$process_person_profile: false`): the browser's person is anonymous, and every Worker event is personless.
- **merges duplicates.** The same type and message within one run is one event. An error that was logged and then rethrown stays unhandled and keeps the `distinct_id`, `session_id`, log text and context of the log.
- **removes secrets** by shape, before cutting texts to 2,000 characters: PostHog keys, `sk-…` keys, bearer tokens and JWTs, long hex strings (R2 keys, SHA-256 hashes), `?token=`/`?key=`-style URL parameters, and context fields named like `password`, `secret`, `token`, `apiKey`.
- **sends only the path** of a request (`trigger: "GET /api/ring"`), never its host or query string. So the start point of a ring request never reaches PostHog through it.
- **sets a `uuid` v5** built from the `TraceItem` alone, so a resend of the same run does not create duplicates in PostHog.
- **retries** the PostHog request on network errors, 5xx and 429 (twice, within the `waitUntil` budget) and never throws; a dropped batch shows up in this worker's own logs.

Stack frames are parsed with `@posthog/core`; frames outside `node_modules` count as our code. Source maps are not uploaded: frames point at the bundled file.

## Use it in a Worker

1. Add the Tail Worker to the Worker's `wrangler.jsonc`:

   ```jsonc
   "tail_consumers": [{ "service": "roadtrip-error-tracking" }]
   ```

   Deploy `roadtrip-error-tracking` before the Workers that point at it. Never add it to its own `tail_consumers`.

2. Add the package to the Worker's `package.json` and run `pnpm install` at the root:

   ```json
   "dependencies": { "error-tracking": "workspace:*" }
   ```

3. Report errors with `logger.error`, never with `captureException`:

   ```ts
   import { logger } from 'error-tracking/logger';

   // The Container answered 500 with { name, message, stack } (engine/protocol, worker/src/container.ts)
   const error = await response.json<{ name: string; message: string; stack: string }>();
   logger.error('[ring] the Container failed', Object.assign(new Error(error.message), { name: error.name, stack: error.stack }), {
   	distinct_id: request.headers.get('X-POSTHOG-DISTINCT-ID') ?? undefined,
   	session_id: request.headers.get('X-POSTHOG-SESSION-ID') ?? undefined,
   	hours,
   });
   ```

   `logger.error(message, error?, context?)` prints `console.error(message, error, context)`:

   - `message`: what was being done. Sent as `log_message`.
   - `error`: anything thrown. The runtime hands the Tail Worker only an Error's name, message and stack, so:
     - Rebuild an error that came as data, like the Container's 500 above, into a real `Error`. A plain object would arrive as JSON text in a `LoggedError`.
     - Errors group by `name`, so give your own classes one: `class SherpaError extends Error { name = 'SherpaError' }`. Without it a subclass groups as plain `Error`.
     - Keep the cause in a context field such as `reason`, not in the class name. The Error's own fields do not reach the Tail Worker.
   - `context`:
     - `distinct_id` and `session_id` are the browser's `X-POSTHOG-DISTINCT-ID` and `X-POSTHOG-SESSION-ID`. Pass them as the headers give them: the Tail Worker removes control characters and cuts them to 1,000 characters. Leave either out when its header is missing.
     - Other string, number and boolean fields become event properties (up to 20), for example `{ reason: 'timeout', citizenship: 'RUS', served: 'stale' }` for a `SherpaError`. A field never overrides what the run itself reports (`worker`, `outcome`, `trigger`…).
     - Never put the start point in context.

   `logger.info(message, details?)` is a line for the Workers logs that the Owner need not look at.

The Container's process is not a Worker, so the Tail Worker does not see it. The Worker that called the Container reports its failures with `logger.error`.

## Deploy

Every push to the default branch deploys this worker through Cloudflare Workers Builds:

- trigger «Deploy default branch» on `roadtrip-error-tracking`;
- empty build command;
- deploy command `pnpm --filter error-tracking run deploy`.

Its `deploy` script (`wrangler deploy`) is the whole deploy: wrangler bundles the worker itself. The trigger and how to check or rerun a build: `docs/agents/infrastructure.md`.

No secrets. One var, `POSTHOG_API_KEY` in `wrangler.jsonc`: the key of the PostHog project `roadtrip` (id 718601), which only writes events and is public; the Worker `roadtrip` sends its own events with the same key. Empty, the worker prints the events instead of sending them: to keep `wrangler dev` from sending events, put `POSTHOG_API_KEY=` in `.dev.vars`.

## Develop

```bash
pnpm test        # vitest: TraceItem → PostHog events, the sender and the tail handler
pnpm typecheck
pnpm cf-typegen  # after changing wrangler.jsonc
```
