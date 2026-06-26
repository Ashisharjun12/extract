import { AsyncLocalStorage } from 'async_hooks';
import {
  createJobContext,
  getDocumentType,
  getJobId,
  getApiKeyLabel,
  recordAICall,
  getJobCostSummary,
} from '../../cost/tracker.js';
import type { JobContext, JobCostSummary, AICallPhase, AICallRecord } from '../../cost/types.js';
export type { JobContext, JobCostSummary, AICallPhase, AICallRecord } from '../../cost/types.js';
export {
  createJobContext,
  getDocumentType,
  getJobId,
  getApiKeyLabel,
  recordAICall,
  getJobCostSummary,
} from '../../cost/tracker.js';
export { getGeminiApiKeyLabel } from '../../cost/tracker.js';

/** Per-request / per-job async context — correlationId, doc type, job id, cost accumulator */
export const correlationStore = new AsyncLocalStorage<JobContext>();

export function getCorrelationId(): string {
  return correlationStore.getStore()?.correlationId ?? 'no-context';
}

/** Run handler with full job context (worker path) */
export function runWithJobContext<T>(
  correlationId: string,
  documentType: string,
  jobId: string,
  fn: () => T,
): T {
  return correlationStore.run(createJobContext(correlationId, documentType, jobId), fn);
}

/** Run handler with correlationId only (HTTP middleware path) */
export function runWithCorrelationId<T>(correlationId: string, fn: () => T): T {
  return correlationStore.run(createJobContext(correlationId, 'HTTP', 'sync'), fn);
}
