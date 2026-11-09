// `pnpm --filter web demo`: the screen without the Worker (e2e/demo.ts) on `DEMO_PORT`, else the preview server's port.
import { startDemo } from './demo.ts';

const server = await startDemo(process.env.DEMO_PORT === undefined ? undefined : Number(process.env.DEMO_PORT));
server.printUrls();
