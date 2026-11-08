// Workers KV's double, for both of the handler's namespaces (src/kv.ts).
import type { Kv } from '../src/kv.ts';
import type { Clock } from './timers.ts';

/** Workers KV in memory: an entry put with `expirationTtl` is gone that many seconds later by `clock`. */
export class MemoryKv implements Kv {
	readonly entries = new Map<string, { value: string; expiresAt: number }>();

	constructor(readonly clock: Clock) {}

	get(key: string): Promise<string | null> {
		const entry = this.entries.get(key);
		return Promise.resolve(entry !== undefined && this.clock.now < entry.expiresAt ? entry.value : null);
	}

	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
		const ttl = options?.expirationTtl;
		this.entries.set(key, { value, expiresAt: ttl === undefined ? Infinity : this.clock.now + ttl * 1000 });
		return Promise.resolve();
	}
}
