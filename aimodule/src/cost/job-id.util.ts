import { createHash } from 'crypto';

/** Stable id for dedup, result cache, and BullMQ jobId — sha256(type:sorted-urls)[0:16] */
export function deriveContentJobId(type: string, urls: string[]): string {
  return createHash('sha256')
    .update(`${type}:${urls.slice().sort().join(',')}`)
    .digest('hex')
    .slice(0, 16);
}
