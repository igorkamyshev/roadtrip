// The Container's process (Dockerfile): loads the dataset's graph and the border table, then listens on PORT
// (8080). The port takes connections only once both are loaded, so the Container counts it ready then: its
// `portReadyTimeoutMS` covers the load (spec «Container и очередь»).
//
//   DATASET_DIR=<directory with graph.graph and dataset.json> PORT=8080 node server/main.ts
//
// The output goes to Workers Observability; the Tail Worker does not see the Container, so the Worker logs its
// failures.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { borderTable } from 'rules';
import { dataVersion } from '../src/index.ts';
import { field } from '../src/json.ts';
import { startCalculator } from './calculator.ts';
import { createEngineServer } from './engine-server.ts';
import { listen } from './http.ts';

const directory = process.env.DATASET_DIR ?? fileURLToPath(new URL('../dataset/', import.meta.url));
const port = Number(process.env.PORT ?? 8080);

const datasetVersion = field(JSON.parse(readFileSync(join(directory, 'dataset.json'), 'utf8')), 'version');
if (typeof datasetVersion !== 'string') {
	throw new TypeError(`${join(directory, 'dataset.json')} is not { "version": "<the dataset's version>" }`);
}
const calculator = await startCalculator(join(directory, 'graph.graph'));
const version = await dataVersion(datasetVersion, borderTable);
const server = await listen(createEngineServer({ calculate: calculator.calculate, dataVersion: version }), port);
const address = server.address();
console.log(
	`engine listening on port ${typeof address === 'string' || address === null ? port : address.port}: data version ${version}, ` +
		`graph of ${calculator.nodes} nodes and ${calculator.edges} edges loaded in ${calculator.loadMs.toFixed(0)} ms, ` +
		`ready ${performance.now().toFixed(0)} ms after the process started`,
);

// The Container stops the process with SIGTERM: after `sleepAfter` without requests, or for a new image.
process.on('SIGTERM', () => {
	server.close();
	process.exit(0);
});

// Without the engine's thread nothing can be calculated: stop taking requests, give the 500s of those it had a
// second to go out, and exit; the next request starts a new Container. Until then the server serves.
const error = await calculator.died;
console.error('the engine’s thread died', error);
server.close();
setTimeout(() => process.exit(1), 1000);
