// JSON the Worker reads without a type: Sherpa's answers, the Container's, and what KV holds. Each reader checks
// the fields it uses through these, rather than asserting a type.

/** An object, its fields not checked yet. */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The field `name` of an object; undefined for anything else. */
export function field(value: unknown, name: string): unknown {
	return isRecord(value) ? value[name] : undefined;
}
