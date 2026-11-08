// Publishes the dataset the world build wrote into a directory (spec «Набор данных», «Выкладка»): its files under
// `<version>/` in R2, then the pointer `current.json` (src/publish.ts). R2 by its S3 API, through the aws CLI, which
// uploads a file of any size in parts; `wrangler r2 object put` takes 300 MiB at most, about the world's graph.
//
//   node data/src/cli/publish-dataset.ts <dataset directory> [--bucket <name>] [--prefix <prefix>]
//
// The account is CLOUDFLARE_ACCOUNT_ID, the S3 credentials AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (the
// workflow derives them from its Cloudflare API token). --prefix puts every key under it, as a trial run does.
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { type DatasetStore, publishDataset } from '../publish.ts';
import { log, userPath } from './input.ts';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: { bucket: { type: 'string', default: 'roadtrip-datasets' }, prefix: { type: 'string', default: '' } },
});
const [directory] = positionals;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (directory === undefined || account === undefined) {
	log('usage: CLOUDFLARE_ACCOUNT_ID=… node data/src/cli/publish-dataset.ts <dataset directory> [--bucket <name>] [--prefix <prefix>]');
	process.exit(2);
}

const endpoint = ['--endpoint-url', `https://${account}.r2.cloudflarestorage.com`];
const url = (key: string) => `s3://${values.bucket}/${values.prefix}${key}`;

const r2: DatasetStore = {
	async upload(key, path) {
		await aws(['s3', 'cp', path, url(key), '--no-progress', '--only-show-errors', ...endpoint]);
	},
	async size(key) {
		const head = await aws(['s3api', 'head-object', '--bucket', values.bucket, '--key', `${values.prefix}${key}`, ...endpoint], { missing: true });
		return head === undefined ? undefined : (JSON.parse(head) as { ContentLength: number }).ContentLength;
	},
	async read(key) {
		return aws(['s3', 'cp', url(key), '-', '--only-show-errors', ...endpoint], { missing: true });
	},
	async write(key, text) {
		await aws(['s3', 'cp', '-', url(key), '--only-show-errors', ...endpoint], { input: text });
	},
};

const { manifest } = await publishDataset(r2, userPath(directory), log);
log(`published ${manifest.version} to ${values.bucket}/${values.prefix}`);

/**
 * Runs the aws CLI and gives its output. With `missing`, an object that is not there gives undefined (S3's 404)
 * instead of an error.
 */
function aws(args: readonly string[], options: { input?: string; missing?: boolean } = {}): Promise<string | undefined> {
	return new Promise((resolve, reject) => {
		const child = spawn('aws', args, {
			stdio: ['pipe', 'pipe', 'pipe'],
			env: {
				...process.env,
				AWS_DEFAULT_REGION: 'auto',
				// R2 does not take the checksums newer aws CLIs send by default.
				AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required',
				AWS_RESPONSE_CHECKSUM_VALIDATION: 'when_required',
			},
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
		child.on('error', reject);
		child.on('close', (code) => {
			const error = Buffer.concat(stderr).toString();
			if (code === 0) {
				resolve(Buffer.concat(stdout).toString());
			} else if (options.missing && /\b404\b|Not Found|does not exist/u.test(error)) {
				resolve(undefined);
			} else {
				reject(new Error(`aws ${args.slice(0, 2).join(' ')} exited with ${String(code)}: ${error.trim()}`));
			}
		});
		child.stdin.end(options.input ?? '');
	});
}
