// Serves a web-standard handler (engine-server.ts) with Node's http module: the Container's port.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { calculationFailure } from '../src/protocol.ts';

export interface Handler {
	fetch(request: Request): Promise<Response>;
}

/** Listens on `port` (0 for a free one) and resolves once the port takes connections. */
export async function listen(handler: Handler, port: number): Promise<Server> {
	const server = createServer((incoming, outgoing) => {
		void respond(handler, incoming, outgoing);
	});
	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(port, () => {
			server.off('error', reject);
			resolve();
		});
	});
	return server;
}

async function respond(handler: Handler, incoming: IncomingMessage, outgoing: ServerResponse): Promise<void> {
	try {
		const chunks: Buffer[] = [];
		for await (const chunk of incoming) {
			chunks.push(chunk as Buffer);
		}
		const headers = new Headers();
		for (const [name, value] of Object.entries(incoming.headers)) {
			if (value !== undefined) {
				headers.set(name, Array.isArray(value) ? value.join(', ') : value);
			}
		}
		const response = await handler.fetch(
			new Request(new URL(incoming.url ?? '/', 'http://engine'), {
				method: incoming.method,
				headers,
				body: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
			}),
		);
		outgoing.writeHead(response.status, Object.fromEntries(response.headers));
		outgoing.end(Buffer.from(await response.arrayBuffer()));
	} catch (error) {
		// The handler answers its own failures; this is a failure of reading the request or writing the answer.
		if (!outgoing.headersSent) {
			outgoing.writeHead(500, { 'content-type': 'application/json' });
		}
		outgoing.end(JSON.stringify(calculationFailure(error)));
	}
}
