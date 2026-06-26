import { createRequire } from 'module';

const require = createRequire(import.meta.url);

if (process.env.NEW_RELIC_LICENSE_KEY && process.env.NEW_RELIC_ENABLED !== 'false') {
  require('newrelic');
}
