// Publishes the dataset the world build wrote into a directory (spec #20 «Набор данных», «Выкладка»): its files under
// `<version>/` in R2, then the pointer `current.json` (src/publish.ts). R2 by its S3 API, through the aws CLI, which
// uploads a file of any size in parts; `wrangler r2 object put` takes 300 MiB at most, about the world's graph.
//
//   node data/src/cli/publish-dataset.ts <dataset directory> [--bucket <name>] [--prefix <prefix>] [--trial]
//
// The account is CLOUDFLARE_ACCOUNT_ID, the S3 credentials AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY (the
// workflow derives them from its Cloudflare API token). --prefix puts every key under it, as a trial run does;
// --trial says the dataset holds some parts of the world only, so its countries' zones are not checked.
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { field } from 'engine/json';
import { type DatasetStore, publishDataset } from '../publish.ts';
import { log, userPath } from './input.ts';

const { values, positionals } = parseArgs({
	allowPositionals: true,
	options: {
		bucket: { type: 'string', default: 'roadtrip-datasets' },
		prefix: { type: 'string', default: '' },
		trial: { type: 'boolean', default: false },
	},
});
const directory = positionals.at(0);
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (directory === undefined || account === undefined) {
	log(
		'usage: CLOUDFLARE_ACCOUNT_ID=… node data/src/cli/publish-dataset.ts <dataset directory> [--bucket <name>] [--prefix <prefix>] [--trial]',
	);
	process.exit(2);
}

const endpoint = ['--endpoint-url', `https://${account}.r2.cloudflarestorage.com`];
const url = (key: string) => `s3://${values.bucket}/${values.prefix}${key}`;

const r2: DatasetStore = {
	async upload(key, path) {
		await aws(['s3', 'cp', path, url(key), '--no-progress', '--only-show-errors', ...endpoint]);
	},
	async size(key) {
		const head = await aws(['s3api', 'head-object', '--bucket', values.bucket, '--key', `${values.prefix}${key}`, ...endpoint], {
			missing: true,
		});
		return head === undefined ? undefined : contentLength(head);
	},
	async read(key) {
		return aws(['s3', 'cp', url(key), '-', '--only-show-errors', ...endpoint], { missing: true });
	},
	async write(key, text) {
		await aws(['s3', 'cp', '-', url(key), '--only-show-errors', ...endpoint], { input: text });
	},
};

const { manifest } = await publishDataset(r2, userPath(directory), { log, trial: values.trial });
log(`published ${manifest.version} to ${values.bucket}/${values.prefix}`);

/**
 * Runs the aws CLI and gives its output. With `missing`, an object that is not there gives undefined (S3's 404)
 * instead of an error.
 */
async function aws(args: readonly string[], options: { input?: string; missing?: boolean } = {}): Promise<string | undefined> {
	const { code, stdout, stderr } = await run(args, options.input ?? '');
	const missing = options.missing === true && /\b404\b|Not Found|does not exist/u.test(stderr);
	if (code !== 0 && !missing) {
		throw new Error(`aws ${args.slice(0, 2).join(' ')} exited with ${String(code)}: ${stderr.trim()}`);
	}
	return code === 0 ? stdout : undefined;
}

/** Runs the aws CLI with `input` on its stdin: its exit code and what it wrote. */
function run(args: readonly string[], input: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
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
		child.stdout.on('data', (chunk: Buffer) => {
			stdout.push(chunk);
		});
		child.stderr.on('data', (chunk: Buffer) => {
			stderr.push(chunk);
		});
		child.on('error', reject);
		child.on('close', (code) => {
			resolve({ code, stdout: Buffer.concat(stdout).toString(), stderr: Buffer.concat(stderr).toString() });
		});
		child.stdin.end(input);
	});
}

/** The size of an object by `aws s3api head-object`'s answer. */
function contentLength(head: string): number {
	const length = field(JSON.parse(head), 'ContentLength');
	if (typeof length !== 'number') {
		throw new TypeError(`aws s3api head-object answered without ContentLength: ${head}`);
	}
	return length;
}
