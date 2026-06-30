
import { _config } from './config/config.js';

if (_config.NEW_RELIC_LICENSE_KEY && process.env.NEW_RELIC_ENABLED !== 'false') {
  require('newrelic');
}
