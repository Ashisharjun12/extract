/**
 * New Relic APM bootstrap — loaded after instrument-otel.ts in server.ts.
 *
 * Loads .env via config.ts, then starts the agent only when a license key exists.
 * All agent settings come from NEW_RELIC_* env vars (no newrelic.js needed).
 *
 * Production tips:
 *   NEW_RELIC_LOG_FILEPATH=stdout   → no newrelic_agent.log on disk
 *   NEW_RELIC_ENABLED=false         → disable agent without removing the package
 */
import { _config } from './config/config.js';

if (_config.NEW_RELIC_LICENSE_KEY && process.env.NEW_RELIC_ENABLED !== 'false') {
  // newrelic is CJS-only — synchronous load before the rest of the app
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('newrelic');
}
