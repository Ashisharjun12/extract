import { GoogleGenAI } from '@google/genai';
import { createHash } from 'crypto';
import { _config } from '../../config/config.js';
import { ObserverService } from '../../infrastructure/observabllity/observer.service.js';

export type PromptCachingMode = 'off' | 'implicit' | 'explicit';

export function getPromptCachingMode(): PromptCachingMode {
  const mode = (_config.PROMPT_CACHING ?? 'implicit').toLowerCase();
  if (mode === 'off' || mode === 'explicit') return mode;
  return 'implicit';
}

interface CacheEntry {
  name: string;
  expiresAt: number;
}


export class PromptCacheService {
  private static entries = new Map<string, CacheEntry>();
  private static inflight = new Map<string, Promise<string | undefined>>();

  static async resolve(
    ai: GoogleGenAI,
    model: string,
    cacheKey: string,
    prompt: string,
  ): Promise<string | undefined> {
    if (getPromptCachingMode() !== 'explicit') return undefined;

    const key = `${model}:${cacheKey}:${createHash('sha256').update(prompt).digest('hex').slice(0, 12)}`;
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      return existing.name;
    }

    if (this.inflight.has(key)) {
      return this.inflight.get(key);
    }

    const promise = this.createCache(ai, model, cacheKey, prompt, key);
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  private static async createCache(
    ai: GoogleGenAI,
    model: string,
    cacheKey: string,
    prompt: string,
    mapKey: string,
  ): Promise<string | undefined> {
    const obs = ObserverService.getInstance();
    const ttlSec = _config.PROMPT_CACHE_TTL_SECONDS ?? 3600;

    try {
      const cache = await ai.caches.create({
        model,
        config: {
          systemInstruction: prompt,
          displayName: `aimodule-${cacheKey}-${model}`,
          ttl: `${ttlSec}s`,
        },
      });

      if (!cache.name) return undefined;

      this.entries.set(mapKey, {
        name: cache.name,
        expiresAt: Date.now() + ttlSec * 1000,
      });

      obs.info('PromptCache: explicit cache created', {
        cacheKey,
        model,
        cacheName: cache.name,
        ttlSec,
      });

      return cache.name;
    } catch (err: any) {
      obs.warn('PromptCache: explicit cache create failed — falling back to uncached', {
        cacheKey,
        model,
        error: err?.message ?? String(err),
      });
      return undefined;
    }
  }
}
