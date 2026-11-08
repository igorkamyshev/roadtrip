// vitest types its asymmetric matchers `any`. In an expected value they are values to compare with, so these give
// them the type `unknown`.
import { expect } from 'vitest';

/** Any string. */
export const anyString: unknown = expect.any(String);

/** Any object. */
export const anyObject: unknown = expect.any(Object);

/** A string with `text` in it. */
export function stringContaining(text: string): unknown {
	return expect.stringContaining(text);
}

/** An object with at least the properties of `object`. */
export function objectContaining(object: Record<string, unknown>): unknown {
	return expect.objectContaining(object);
}
