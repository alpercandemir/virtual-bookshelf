import { buildApp } from './app.js';
import { getConfig } from './config/env.js';
import { disconnectPrisma } from './lib/prisma.js';

const config = getConfig();

const app = await buildApp({ logger: true });

const shutdown = async () => {
  await app.close();
  await disconnectPrisma();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
