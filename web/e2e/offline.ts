// The network of the screen tests' browser: a proxy on the discard port, where nothing listens, for every host but the
// preview server's. Every request no route of the fixtures answers goes there and fails, so nothing a test runs
// reaches the network: not PostHog's beacons of a page already gone, which no route sees (fixtures.ts). What the
// fixtures answer never leaves the browser. playwright.config.ts gives it to every test's context.
export const OFFLINE = { server: 'http://127.0.0.1:9', bypass: 'localhost' };
