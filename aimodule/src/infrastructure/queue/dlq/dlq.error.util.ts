import { Job } from 'bullmq';
import { UnrecoverableDocumentError } from '../../../shared/errors/document.errors.js';
import type { JobCostSummary } from '../../../cost/types.js';

export interface DLQCostSnapshot {
  apiCallCount: number;
  totalCostUsd: number;
  totalCostINR: number;
  totalTokens: number;
}

export interface DLQErrorRecord {
  message: string;
  name: string;
  stack?: string;
  code?: string;
  reason?: string;
  jobId?: string;
  attemptsMade?: number;
  correlationId?: string;
  cause?: unknown;
  aiCost?: DLQCostSnapshot;
}

export function snapshotJobCost(summary: JobCostSummary | null | undefined): DLQCostSnapshot | undefined {
  if (!summary || summary.apiCallCount === 0) return undefined;
  return {
    apiCallCount: summary.apiCallCount,
    totalCostUsd: summary.totalCostUsd,
    totalCostINR: summary.totalCostINR,
    totalTokens: summary.totalTokens,
  };
}

function serializeCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return cause;
}

export function serializeDLQError(
  err: Error,
  job?: Job,
  reason?: string,
  costSummary?: JobCostSummary | null,
): DLQErrorRecord {
  const record: DLQErrorRecord = {
    name: err.name ?? 'Error',
    message: err.message ?? String(err),
    stack: err.stack,
  };

  if (err instanceof UnrecoverableDocumentError) {
    record.code = err.code;
  }

  const extended = err as Error & { code?: string; cause?: unknown };
  if (extended.code && !record.code) record.code = String(extended.code);
  if (extended.cause !== undefined) record.cause = serializeCause(extended.cause);
  if (reason) record.reason = reason;

  if (job) {
    record.jobId = job.id;
    record.attemptsMade = job.attemptsMade;
    const data = job.data as Record<string, unknown> | undefined;
    if (data?.correlationId) record.correlationId = String(data.correlationId);
  }

  const aiCost = snapshotJobCost(costSummary);
  if (aiCost) record.aiCost = aiCost;

  return record;
}

export function normalizeStoredDLQError(raw: unknown): { message: string; details: DLQErrorRecord } {
  if (typeof raw === 'string') {
    return { message: raw, details: { name: 'Error', message: raw } };
  }
  if (raw && typeof raw === 'object') {
    const o = raw as DLQErrorRecord;
    return {
      message: o.message ?? 'Unknown error',
      details: o,
    };
  }
  return { message: 'Unknown error', details: { name: 'Error', message: 'Unknown error' } };
}
