import DbFactory from '../shared/database/db.factory.js';
import { _config } from '../config/config.js';
import { deriveContentJobId, type ContentJobOptions } from './job-id.util.js';
import { ObserverService } from '../infrastructure/observabllity/observer.service.js';

const KEY_PREFIX = 'extract:result:';

/** Redis cache for completed extractions — avoids re-processing same doc (no Postgres). */
export class ExtractionResultCache {
  static enabled(): boolean {
    return _config.RESULT_CACHE_ENABLED === 'true';
  }

  private static cacheKey(type: string, urls: string[], options: ContentJobOptions = {}): string {
    return `${KEY_PREFIX}${deriveContentJobId(type, urls, options)}`;
  }

  static async get(
    type: string,
    urls: string[],
    options: ContentJobOptions = {},
  ): Promise<unknown | null> {
    if (!this.enabled()) return null;
    try {
      const raw = await DbFactory.getQueueRedis().getClient().get(this.cacheKey(type, urls, options));
      if (!raw) return null;
      ObserverService.getInstance().info('ExtractionResultCache: hit', {
        type,
        jobId: deriveContentJobId(type, urls, options),
      });
      return JSON.parse(raw);
    } catch (err) {
      ObserverService.getInstance().logError('ExtractionResultCache: get failed', err);
      return null;
    }
  }

  static async set(
    type: string,
    urls: string[],
    result: unknown,
    options: ContentJobOptions = {},
  ): Promise<void> {
    if (!this.enabled()) return;
    const ttl = _config.RESULT_CACHE_TTL_SECONDS;
    try {
      await DbFactory.getQueueRedis()
        .getClient()
        .setex(this.cacheKey(type, urls, options), ttl, JSON.stringify(result));
      ObserverService.getInstance().info('ExtractionResultCache: stored', {
        type,
        jobId: deriveContentJobId(type, urls, options),
        ttlSec: ttl,
      });
    } catch (err) {
      ObserverService.getInstance().logError('ExtractionResultCache: set failed', err);
    }
  }
}
