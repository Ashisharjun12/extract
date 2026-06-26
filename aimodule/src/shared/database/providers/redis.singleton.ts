import { Redis } from 'ioredis';
import { logger } from '../../../utils/logger.js';

export const REDIS_USAGE = {
  RATE_LIMIT: 'rate-limit',
  QUEUE: 'queue',
} as const;

class RedisSingleton {
  private static instances: Map<string, RedisSingleton> = new Map();
  private client: Redis | null = null;
  private uri: string;

  private constructor(uri: string) {
    this.uri = uri;
  }

  static getConnection(usage: string, uri: string): RedisSingleton {
    if (!this.instances.has(usage)) {
      this.instances.set(usage, new RedisSingleton(uri));
    }
    return this.instances.get(usage)!;
  }

  getClient(): Redis {
    if (!this.client) {
      if (!this.uri) {
        logger.error('Redis URI is not defined');
      }
      this.client = new Redis(this.uri, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      });
      this.client.on('error', (err) => {
        logger.error(err, `Redis connection error [${this.uri}]`);
      });
    }
    return this.client;
  }
}

export default RedisSingleton;
