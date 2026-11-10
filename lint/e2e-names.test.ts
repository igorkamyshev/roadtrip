import { describe, expect, it } from 'vitest';
import { sharedNames } from './e2e-names.ts';

describe('the top-level names of the screen tests', () => {
	it('are fine when each spec declares its own', () => {
		expect(
			sharedNames({
				'web/e2e/ring.spec.ts': "const LINK = '/#/?h=3';\nasync function openTheRing(page) {}",
				'web/e2e/visa.spec.ts': "const VISA_LINK = '/#/?h=2';\nconst choice = (page, name) => page.getByRole('button', { name });",
			}),
		).toEqual([]);
	});

	it('clash when two specs declare one constant or function', () => {
		expect(
			sharedNames({
				'web/e2e/cities.spec.ts': "const settle = async (page) => {};\nexport const LINK = '/#/?h=3';",
				'web/e2e/hover.spec.ts': "const LINK = '/#/?h=3';",
				'web/e2e/carousel.spec.ts': 'async function settle(page) {}',
			}),
		).toEqual([
			'LINK is declared in web/e2e/cities.spec.ts and web/e2e/hover.spec.ts: move it to web/e2e/screen.ts or web/e2e/fixtures.ts if it is one thing, or give each a name that tells them apart',
			'settle is declared in web/e2e/carousel.spec.ts and web/e2e/cities.spec.ts: move it to web/e2e/screen.ts or web/e2e/fixtures.ts if it is one thing, or give each a name that tells them apart',
		]);
	});

	it('clash when a spec declares a name a shared module of web/e2e has', () => {
		expect(
			sharedNames({
				'web/e2e/screen.ts': 'export async function holdTheClock(page) {}',
				'web/e2e/analytics.spec.ts': 'async function holdTheClock(page) {}',
			}),
		).toEqual([
			'holdTheClock is declared in web/e2e/analytics.spec.ts and web/e2e/screen.ts: use the one in web/e2e/screen.ts, or give this one a name that tells them apart',
		]);
	});

	it('count the names a destructuring declares', () => {
		expect(
			sharedNames({
				'web/e2e/a.spec.ts': 'const { width, height: tall } = WINDOW;',
				'web/e2e/b.spec.ts': 'const [width] = SIZES;\nconst tall = 900;',
			}),
		).toEqual([
			'tall is declared in web/e2e/a.spec.ts and web/e2e/b.spec.ts: move it to web/e2e/screen.ts or web/e2e/fixtures.ts if it is one thing, or give each a name that tells them apart',
			'width is declared in web/e2e/a.spec.ts and web/e2e/b.spec.ts: move it to web/e2e/screen.ts or web/e2e/fixtures.ts if it is one thing, or give each a name that tells them apart',
		]);
	});

	it('leave out what is not at the top level, and types', () => {
		expect(
			sharedNames({
				'web/e2e/a.spec.ts': "test('a', async ({ page }) => { const card = page.getByTestId('card'); });\ninterface Row { name: string }",
				'web/e2e/b.spec.ts': "function open(page) { const card = page.getByTestId('card'); }\ntype Row = { name: string };",
			}),
		).toEqual([]);
	});

	it('leave the shared modules to one another: fixtures.ts may use what screen.ts names', () => {
		expect(
			sharedNames({
				'web/e2e/screen.ts': 'const START = 0;',
				'web/e2e/fixtures.ts': 'const START = 1;',
			}),
		).toEqual([]);
	});
});
