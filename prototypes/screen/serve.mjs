// PROTOTYPE: serves prototypes/screen at http://localhost:4173 (pnpm prototype:screen).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const port = Number(process.env.PORT) || 4173;

createServer(async (req, res) => {
	const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
	const file = join(root, path === '/' ? 'index.html' : path);
	try {
		const body = await readFile(file);
		res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
		res.end(body);
	} catch {
		res.writeHead(404).end('not found');
	}
}).listen(port, () => console.log(`Прототип экрана: http://localhost:${port}/#a`));
