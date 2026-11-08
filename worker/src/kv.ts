// A Workers KV namespace as the handlers use it: the ring cache (`RINGS`) and Sherpa's copies (`VISA_RULES`). The
// entry passes the bindings themselves; the tests pass a double in memory (test/api.ts).

/** Text values by key, each with an expiry in seconds or none. */
export interface Kv {
	get(key: string): Promise<string | null>;
	/** Without `expirationTtl` the entry stays for good. */
	put(key: string, value: string, options?: { expirationTtl: number }): Promise<void>;
}
