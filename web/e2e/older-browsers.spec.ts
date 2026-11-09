// The bundle for older browsers (web/older-browsers.ts): a browser without the methods of ES2023 and ES2024 loads the
// polyfills before the client, and a newer one never asks for them. Chromium plays the older browser by losing those
// methods before the page's scripts run.
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { firstCard } from './screen.ts';

/** The page's requests for the polyfills' chunk, as they come. */
function polyfillRequests(page: Page): string[] {
	const requests: string[] = [];
	page.on('request', (request) => {
		const { pathname } = new URL(request.url());
		requests.push(...[pathname].filter((path) => path.startsWith('/assets/polyfills-')));
	});
	return requests;
}

test('a browser without the methods of ES2023 and ES2024 loads the polyfills, and the screen works', async ({ page }) => {
	await page.addInitScript(() => {
		Reflect.deleteProperty(Array.prototype, 'toSorted');
		Reflect.deleteProperty(Object, 'groupBy');
		Reflect.deleteProperty(Promise, 'withResolvers');
	});
	const requests = polyfillRequests(page);

	await page.goto('/');

	// The citizenships' and visas' lists are sorted with toSorted as their module loads: without it no screen at all.
	await expect(firstCard(page)).toContainText('Откуда едем?');
	expect(requests).toHaveLength(1);
});

test('a newer browser never asks for the polyfills', async ({ page }) => {
	const requests = polyfillRequests(page);

	await page.goto('/');

	await expect(firstCard(page)).toContainText('Откуда едем?');
	expect(requests).toEqual([]);
});
