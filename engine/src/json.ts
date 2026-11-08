// JSON read without a type: what JSON.parse gives, a request's body, a file. A reader checks the fields it uses
// through these, so a value of another shape fails with a message or reads as missing, instead of going on as the
// wrong type. Portable like the rest of the engine: the client bundles it through data/cities-file.

/** An object, not an array, its fields not checked yet. */
export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The object's own field `name`; undefined for anything but an object, or when it has no such field. */
export function field(value: unknown, name: string): unknown {
	return isRecord(value) ? Object.getOwnPropertyDescriptor(value, name)?.value : undefined;
}

/** The items of an array; an error naming `what` for anything else. */
export function items(value: unknown, what: string): readonly unknown[] {
	if (!Array.isArray(value)) {
		throw new TypeError(`${what} is not a list`);
	}
	return value;
}
