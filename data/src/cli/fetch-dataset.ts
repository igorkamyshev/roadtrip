// Takes the current dataset out of R2 for the deploy of the Worker roadtrip (spec #20 «Набор данных», «Деплой»; #36):
// the version `current.json` points at, each file checked by its SHA-256 (src/fetch-dataset.ts), into the places the
// deploy builds from:
//
// - the graph and its version into engine/dataset/, which the Container's image copies (engine/Dockerfile) and whose
//   dataset.json the Worker bundles;
// - the zone outlines, the cities file, the places file and the cells of the outlines (`place-outlines/`, a file per
//   cell) into web/public/data/, which the client's build copies into its static assets. A dataset without places
//   (one from before them) puts neither there.
//
//   node data/src/cli/fetch-dataset.ts [--bucket <name>]
//
// R2 by Cloudflare's API with CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID, which Workers Builds gives the deploy
// command: the build token's (docs/agents/infrastructure.md). The token needs Workers R2 Storage: Read.
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { type DatasetSource, fetchDataset } from '../fetch-dataset.ts';
import { PLACE_OUTLINES_DIRECTORY, PLACE_OUTLINES_FILE, PLACES_FILE } from '../publish.ts';
import { log } from './input.ts';

const ROOT = join(import.meta.dirname, '../../..');

/** Each file of the dataset the deploy takes, and where it goes (the cells: their directory); `report.md` stays in R2. */
const PLACES = {
	'graph.graph': join(ROOT, 'engine/dataset/graph.graph'),
	'dataset.json': join(ROOT, 'engine/dataset/dataset.json'),
	'zones.json': join(ROOT, 'web/public/data/zones.json'),
	'cities.json': join(ROOT, 'web/public/data/cities.json'),
	[PLACES_FILE]: join(ROOT, 'web/public/data', PLACES_FILE),
	[PLACE_OUTLINES_FILE]: join(ROOT, 'web/public/data', PLACE_OUTLINES_DIRECTORY),
};

const { values } = parseArgs({ options: { bucket: { type: 'string', default: 'roadtrip-datasets' } } });
// An empty variable is as good as none.
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const account = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const missing = Object.entries({ CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account })
	.filter(([, value]) => value === '')
	.map(([name]) => name);
if (missing.length > 0) {
	log(
		`${missing.join(' and ')} not set. usage: CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… node data/src/cli/fetch-dataset.ts [--bucket <name>]`,
	);
	process.exit(2);
}

const objects = `https://api.cloudflare.com/client/v4/accounts/${account}/r2/buckets/${values.bucket}/objects`;

const r2: DatasetSource = {
	async get(key) {
		const response = await fetch(`${objects}/${key}`, { headers: { authorization: `Bearer ${token}` } });
		// R2 answers 404 for a key the bucket lacks: no body. Any other answer is a failure unless it is OK, with a body.
		const body = response.status === 404 ? undefined : response.body;
		if (body === null || (body !== undefined && !response.ok)) {
			const why =
				response.status === 401 || response.status === 403 ? ' (the API token needs Workers R2 Storage: Read on the account)' : '';
			throw new Error(`R2 answered ${response.status} to GET ${values.bucket}/${key}${why}: ${await response.text()}`);
		}
		return body;
	},
};

const manifest = await fetchDataset(r2, PLACES, log);
log(`the deploy takes the dataset ${manifest.version} from ${values.bucket}`);
