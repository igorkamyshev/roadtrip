// The prototype stand roadtrip-stand (#100, worker/README.md «The prototype stand»): the client of the branch it was
// deployed from, as its static assets, and production behind it. Assets are served before the Worker runs, so every
// path without a file (`/api/ring`, `/tiles/…`, `/data/…`, which the stand's build does not have) reaches the Worker,
// which asks production for it by its public address: the zone's WAF rate limit on `/api/ring` applies, as to anyone.
import { PRODUCTION_HOST } from '../src/api.ts';

export default {
	fetch(request) {
		const url = new URL(request.url);
		url.host = PRODUCTION_HOST;
		return fetch(new Request(url, request));
	},
} satisfies ExportedHandler;
