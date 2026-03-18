import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp();

app.listen({ port: config.port, host: config.host }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Monolith Docs API listening at ${address}`);
});
