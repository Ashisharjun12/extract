import RedisSingleton, { REDIS_USAGE } from './providers/redis.singleton.js';
import { _config } from '../../config/config.js';

// Db factory for all redis connections
class DbFactory {
  static getQueueRedis(): RedisSingleton {
    return RedisSingleton.getConnection(REDIS_USAGE.QUEUE, _config.REDIS_QUEUE_URI as string);
  }

  static getRateLimitRedis(): RedisSingleton {
    return RedisSingleton.getConnection(REDIS_USAGE.RATE_LIMIT, _config.REDIS_RATE_LIMIT_URI as string);
  }
}

export default DbFactory;
