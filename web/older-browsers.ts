// The bundle for older browsers: the polyfills of what the client uses and its oldest browsers lack (core-js by
// usage, made by @vitejs/plugin-legacy), in a chunk that only a browser missing a method of ES2023 or ES2024 loads,
// before the entry. A newer browser takes the entry alone, preloaded with the page, and pays nothing for them.
import legacy from '@vitejs/plugin-legacy';
import type { Plugin, PluginOption } from 'vite';

/** A browser that needs no polyfill: it has the newest methods the client may call (web/tsconfig.json's lib, es2024). */
const NEEDS_NO_POLYFILL = "'toSorted' in Array.prototype && 'groupBy' in Object && 'withResolvers' in Promise";

/** A module script of the built page, as Vite writes it. */
const SCRIPT = /<script type="module" crossorigin src="(?<src>[^"]+)"><\/script>/gu;

/** The page's entry and the polyfills' chunk, from its module scripts. */
function pageScripts(html: string): { entry: string; polyfills: string } {
	const sources = [...html.matchAll(SCRIPT)].map((match) => match.groups?.src ?? '');
	const polyfills = sources.find((src) => src.includes('/polyfills-'));
	const entry = sources.find((src) => !src.includes('/polyfills-'));
	if (polyfills === undefined || entry === undefined || sources.length !== 2) {
		throw new Error(`The built page has other module scripts than the entry and the polyfills: ${sources.join(', ')}`);
	}
	return { entry, polyfills };
}

/** Swaps the page's two module scripts for a loader that takes the polyfills only where a browser needs them. */
function polyfillsWhereMissing(): Plugin {
	return {
		name: 'roadtrip:polyfills-where-missing',
		apply: 'build',
		transformIndexHtml: {
			order: 'post',
			handler(html) {
				const { entry, polyfills } = pageScripts(html);
				const loader =
					`<link rel="modulepreload" crossorigin href="${entry}">\n` +
					`<script type="module">if (!(${NEEDS_NO_POLYFILL})) await import('${polyfills}');\nawait import('${entry}');</script>`;
				return html.replaceAll(SCRIPT, (tag: string) => (tag.includes(entry) ? loader : ''));
			},
		},
	};
}

/** The polyfills for `browsers`, the oldest the client supports, in a chunk of their own that only an older one loads. */
export function olderBrowsers(browsers: readonly string[]): PluginOption[] {
	return [legacy({ renderLegacyChunks: false, modernPolyfills: true, modernTargets: [...browsers] }), polyfillsWhereMissing()];
}
