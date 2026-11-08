// The citizenships' visa rules from Sherpa, through their copies in Workers KV (spec «Визовые правила и сведение»,
// #11). A copy per citizenship holds only Sherpa's table «country → class» and when it came:
//
// - a copy is fresh for a day;
// - a stale copy is served at once and refreshed in the background (`waitUntil`), by one request of an isolate at a
//   time;
// - without a copy, the request waits for Sherpa;
// - a good copy is never deleted, and a failed load never overwrites it;
// - after a failure, the next request to Sherpa for that citizenship waits 15 min: a mark in KV with a TTL.
//
// Every failure goes to `logger.error` as a `SherpaError`, also when the person got the stale copy, and every request
// to Sherpa to PostHog as `sherpa fetched`.
import type { LogContext, Logger } from 'error-tracking/logger';
import type { Analytics } from './analytics.ts';
import { isRecord } from './json.ts';
import type { Kv } from './kv.ts';
import {
	failureReason,
	fetchSherpaClasses,
	isSherpaClasses,
	type SherpaClasses,
	type SherpaDeps,
	SherpaError,
	type SherpaFailure,
} from './sherpa.ts';

/** A copy is fresh this long after it came from Sherpa. Sherpa advises an hour; we keep it longer on purpose (#11). */
const FRESH_MS = 24 * 60 * 60 * 1000;

/** After a failure, no new request to Sherpa for the citizenship this long. */
const RETRY_AFTER_SECONDS = 15 * 60;

export interface VisaRulesDeps extends SherpaDeps {
	/** The visa rules' namespace in Workers KV (`roadtrip-visa-rules`). */
	readonly visaRules: Kv;
	/**
	 * The citizenships whose stale copy is being refreshed from this isolate (index.ts keeps one set per isolate), so
	 * that the requests that meet the stale copy meanwhile start no refresh of their own.
	 */
	readonly refreshing: Set<string>;
	/** Milliseconds since the epoch. */
	readonly now: () => number;
	readonly waitUntil: (promise: Promise<unknown>) => void;
	readonly logger: Pick<Logger, 'error'>;
	/** For `sherpa fetched`, on every request to Sherpa. */
	readonly analytics: Analytics;
}

/** A citizenship's copy: Sherpa's classes and when they came from Sherpa (ISO 8601). */
export interface VisaRulesCopy {
	readonly loadedAt: string;
	readonly classes: SherpaClasses;
}

/** Each citizenship's copy, or the first citizenship (in the query's order) that has none. */
export type CitizenshipsRules = { readonly copies: ReadonlyMap<string, VisaRulesCopy> } | { readonly missing: string };

/**
 * The visa rules of `citizenships`, from their copies or from Sherpa. `context` (the browser's ids, N) goes with
 * each failure to `logger.error`.
 */
export async function citizenshipsRules(
	citizenships: readonly string[],
	deps: VisaRulesDeps,
	context: LogContext,
): Promise<CitizenshipsRules> {
	const copies = await Promise.all(citizenships.map((citizenship) => visaRules(citizenship, deps, context)));
	const found = new Map<string, VisaRulesCopy>();
	for (const [index, citizenship] of citizenships.entries()) {
		const copy = copies[index];
		if (copy === undefined) {
			return { missing: citizenship };
		}
		found.set(citizenship, copy);
	}
	return { copies: found };
}

const copyKey = (citizenship: string) => `visa-rules:${citizenship}`;
const failedKey = (citizenship: string) => `visa-rules-failed:${citizenship}`;

/** A copy as KV holds it; undefined for anything else, which counts as no copy. */
function parseCopy(stored: string): VisaRulesCopy | undefined {
	const copy: unknown = JSON.parse(stored);
	return isRecord(copy) && typeof copy.loadedAt === 'string' && isSherpaClasses(copy.classes)
		? { loadedAt: copy.loadedAt, classes: copy.classes }
		: undefined;
}

/** One citizenship's copy, refreshed or loaded as the rules above say; undefined when there is none. */
async function visaRules(citizenship: string, deps: VisaRulesDeps, context: LogContext): Promise<VisaRulesCopy | undefined> {
	const stored = await deps.visaRules.get(copyKey(citizenship));
	const copy = stored === null ? undefined : parseCopy(stored);
	if (copy !== undefined && deps.now() - Date.parse(copy.loadedAt) < FRESH_MS) {
		return copy;
	}
	const failedRecently = (await deps.visaRules.get(failedKey(citizenship))) !== null;
	if (copy !== undefined) {
		if (!failedRecently && !deps.refreshing.has(citizenship)) {
			deps.refreshing.add(citizenship);
			deps.waitUntil(
				load({ citizenship, mode: 'background', context }, deps).finally(() => {
					deps.refreshing.delete(citizenship);
				}),
			);
		}
		return copy;
	}
	return failedRecently ? undefined : load({ citizenship, mode: 'blocking', context }, deps);
}

/**
 * A load from Sherpa: the citizenship, its `mode` (`background` refreshes a stale copy the person was served;
 * `blocking` is waited for, as there was no copy) and the context for `logger.error`.
 */
interface Load {
	readonly citizenship: string;
	readonly mode: 'background' | 'blocking';
	readonly context: LogContext;
}

/** Loads the citizenship's classes from Sherpa into a new copy, or marks the failure and logs it. */
async function load({ citizenship, mode, context }: Load, deps: VisaRulesDeps): Promise<VisaRulesCopy | undefined> {
	const started = deps.now();
	const result = await fetchSherpaClasses(citizenship, deps);
	deps.analytics.capture('sherpa fetched', {
		citizenship,
		result: result.result,
		...('status' in result && result.status !== undefined ? { status: result.status } : {}),
		duration_ms: deps.now() - started,
		mode,
		...(result.quotaRemaining === undefined ? {} : { quota_remaining: result.quotaRemaining }),
	});
	if (result.result !== 'ok') {
		failed({ citizenship, failure: result, served: mode === 'background' ? 'stale' : 'error', context }, deps);
		return undefined;
	}
	const copy: VisaRulesCopy = { loadedAt: new Date(deps.now()).toISOString(), classes: result.classes };
	deps.waitUntil(
		deps.visaRules.put(copyKey(citizenship), JSON.stringify(copy)).catch((error: unknown) => {
			deps.logger.error('[visa rules] KV did not take the copy', error, { ...context, citizenship });
		}),
	);
	return copy;
}

/** A failed load: the citizenship, Sherpa's failure, what the person was served, and the context for `logger.error`. */
interface Failure {
	readonly citizenship: string;
	readonly failure: SherpaFailure;
	readonly served: 'stale' | 'error';
	readonly context: LogContext;
}

/** Logs Sherpa's failure and marks it, so that no request goes to Sherpa for the citizenship for 15 min. */
function failed({ citizenship, failure, served, context }: Failure, deps: VisaRulesDeps): void {
	const reason = failureReason(failure);
	// The message is the reason alone, so that PostHog groups the failures by it; the detail goes with the context.
	deps.logger.error('[visa rules] Sherpa failed', new SherpaError(`Sherpa's /v3/maps failed: ${reason}`), {
		...context,
		reason,
		citizenship,
		served,
		problem: failure.problem,
	});
	deps.waitUntil(
		deps.visaRules.put(failedKey(citizenship), reason, { expirationTtl: RETRY_AFTER_SECONDS }).catch((error: unknown) => {
			deps.logger.error('[visa rules] KV did not take the mark of a failure', error, { ...context, citizenship });
		}),
	);
}
