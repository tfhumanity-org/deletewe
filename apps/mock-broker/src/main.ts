import { serve } from '@hono/node-server';
import { createMockBroker } from './server.ts';

const port = Number(process.env['PORT'] ?? '8788');
const { app, state } = createMockBroker();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`mock broker listening on http://localhost:${String(info.port)}`);
  console.log(`  ${String(state.people.size)} records, search at /search/ada-lovelace`);
});
