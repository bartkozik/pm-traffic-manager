import { getConfig } from './config.js';
import { buildApp } from './app.js';

async function start(): Promise<void> {
  const config = getConfig();
  const app = await buildApp(config);

  await app.listen({
    host: config.host,
    port: config.port,
  });
}

start().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
