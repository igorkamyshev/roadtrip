// Parsed JSON is `unknown` until read (JSON.parse gives `any`): these read it field by field, so a file or an answer
// of another shape fails with a message, or reads as missing, instead of going on as the wrong type. No Node APIs:
// cities-file.ts, which the client bundles, reads with these.

/** The field `name` of a JSON object, or undefined when `json` is no object or has no such field. */
export function field(json: unknown, name: string): unknown {
	if (typeof json !== 'object' || json === null || !Object.hasOwn(json, name)) {
		return undefined;
	}
	return Object.getOwnPropertyDescriptor(json, name)?.value;
}

/** The items of a JSON array; an error naming `what` for anything else. */
export function items(json: unknown, what: string): readonly unknown[] {
	if (!Array.isArray(json)) {
		throw new TypeError(`${what} is not a list`);
	}
	return json;
}
