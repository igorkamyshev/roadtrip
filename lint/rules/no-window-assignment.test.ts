import { noWindowAssignment } from './no-window-assignment.ts';
import { ruleTester } from './rule-tester.ts';

ruleTester().run('no-window-assignment', noWindowAssignment, {
	valid: [
		"window.location.hash = '#/?h=3';",
		'map.current = created;',
		'function draw(window) { window.map = map; }',
		'Object.assign(options, { center: [19.26, 42.44] });',
	],
	invalid: [
		{ code: 'window.__roadtripMap = map;', errors: [{ message: /test hooks/u }] },
		{ code: 'globalThis.ring = answer;', errors: [{ message: /test hooks/u }] },
		{ code: "window['ring'] = answer;", errors: [{ message: /test hooks/u }] },
		{ code: '(window as unknown as { map: unknown }).map = map;', errors: [{ message: /test hooks/u }] },
		{ code: 'Object.assign(window, { map });', errors: [{ message: /test hooks/u }] },
		{ code: "Object.defineProperty(globalThis, 'map', { value: map });", errors: [{ message: /test hooks/u }] },
	],
});
