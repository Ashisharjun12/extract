import { createHash } from 'crypto';

export type WorkshopTableLayout = 'split' | 'sequential';

export interface ContentJobOptions {
  tableLayout?: WorkshopTableLayout;
}

/** Stable id for dedup, result cache, and BullMQ jobId — sha256(type:sorted-urls[:layout])[0:16] */
export function deriveContentJobId(
  type: string,
  urls: string[],
  options: ContentJobOptions = {},
): string {
  const layoutSuffix =
    type.toUpperCase() === 'WORKSHOP' && options.tableLayout === 'sequential'
      ? ':sequential'
      : '';
  return createHash('sha256')
    .update(`${type}:${urls.slice().sort().join(',')}${layoutSuffix}`)
    .digest('hex')
    .slice(0, 16);
}
