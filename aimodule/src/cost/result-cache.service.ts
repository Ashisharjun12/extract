import DbFactory from '../shared/database/db.factory.js';
import { _config } from '../config/config.js';
import { deriveContentJobId } from './job-id.util.js';
import { ObserverService } from '../infrastructure/observabllity/observer.service.js';

const KEY_PREFIX = 'extract:result:';

/** Redis cache for completed extractions — avoids re-processing same doc (no Postgres). */
export class ExtractionResultCache {
  static enabled(): boolean {
    return _config.RESULT_CACHE_ENABLED === 'true';
  }

  private static cacheKey(type: string, urls: string[]): string {
    return `${KEY_PREFIX}${deriveContentJobId(type, urls)}`;
  }

  static async get(type: string, urls: string[]): Promise<unknown | null> {
    if (!this.enabled()) return null;
    try {
      const raw = await DbFactory.getQueueRedis().getClient().get(this.cacheKey(type, urls));
      if (!raw) return null;
      ObserverService.getInstance().info('ExtractionResultCache: hit', {
        type,
        jobId: deriveContentJobId(type, urls),
      });
      return JSON.parse(raw);
    } catch (err) {
      ObserverService.getInstance().logError('ExtractionResultCache: get failed', err);
      return null;
    }
  }

  static async set(type: string, urls: string[], result: unknown): Promise<void> {
    if (!this.enabled()) return;
    const ttl = _config.RESULT_CACHE_TTL_SECONDS;
    try {
      await DbFactory.getQueueRedis()
        .getClient()
        .setex(this.cacheKey(type, urls), ttl, JSON.stringify(result));
      ObserverService.getInstance().info('ExtractionResultCache: stored', {
        type,
        jobId: deriveContentJobId(type, urls),
        ttlSec: ttl,
      });
    } catch (err) {
      ObserverService.getInstance().logError('ExtractionResultCache: set failed', err);
    }
  }
}
