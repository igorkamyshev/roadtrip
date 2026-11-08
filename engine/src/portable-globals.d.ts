// The globals the engine uses beyond ECMAScript. Node, Workers and browsers all have them, so the engine stays
// portable (ADR 0001); this file stands in for their type packages, which would let Node or DOM APIs in.
declare const performance: { readonly now: () => number };
declare const TextEncoder: new () => { readonly encode: (input?: string) => Uint8Array<ArrayBuffer> };
declare const TextDecoder: new () => { readonly decode: (input?: Uint8Array) => string };
declare const crypto: {
	readonly subtle: { readonly digest: (algorithm: 'SHA-256', data: Uint8Array) => Promise<ArrayBuffer> };
};
