import { jsonThroughEngine } from './json-through-engine.ts';
import { ruleTester } from './rule-tester.ts';

ruleTester().run('json-through-engine', jsonThroughEngine, {
	valid: [
		"isRecord(value) && typeof value.graphPath === 'string';",
		"const version = field(json, 'version');",
		"typeof address === 'string' || address === null ? port : address.port;",
		"typeof value === 'number';",
	],
	invalid: [
		{ code: "typeof value === 'object' && value !== null;", errors: [{ message: /engine\/json/u }] },
		{ code: "value !== null && typeof value === 'object';", errors: [{ message: /engine\/json/u }] },
		{
			code: "if (typeof json !== 'object' || json === null) { throw new TypeError('no manifest'); }",
			errors: [{ message: /engine\/json/u }],
		},
		{ code: "'object' === typeof value;", errors: [{ message: /engine\/json/u }] },
	],
});
