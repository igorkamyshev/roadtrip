// The globals the engine uses beyond ECMAScript. Node, Workers and browsers all have them, so the engine stays
// portable (ADR 0001); this file stands in for their type packages, which would let Node or DOM APIs in.
declare const performance: { now(): number };
declare class TextEncoder {
	encode(input?: string): Uint8Array<ArrayBuffer>;
}
declare class TextDecoder {
	decode(input?: Uint8Array): string;
}
