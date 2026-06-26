import { Job } from 'bullmq';
import { dlqQueue } from '../../infrastructure/queue/dlq/dlq.queue.js';
import { DLQ_NAME } from '../../infrastructure/queue/dlq/dlq.queue.js';
import {
  normalizeStoredDLQError,
  type DLQErrorRecord,
  type DLQCostSnapshot,
} from '../../infrastructure/queue/dlq/dlq.error.util.js';
import { resolveQueue, ALL_QUEUES } from '../../infrastructure/queue/docs/queues.js';
import { ObserverService } from '../../infrastructure/observabllity/observer.service.js';
import { _config } from '../../config/config.js';
import { logger } from '../../utils/logger.js';

export interface DLQJobSummary {
  id: string | undefined;
  originalQueue: string;
  failedAt: string | undefined;
  error: string | undefined;
  errorDetails: DLQErrorRecord;
  aiCost?: DLQCostSnapshot;
  payload: unknown;
  documentType: string | undefined;
  attemptsMade: number | undefined;
  timestamp: number | undefined;
}

export interface QueueHealthRow {
  queueName: string;
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  overloaded: boolean;
}

export class AdminService {
  private readonly obs = ObserverService.getInstance();

  async getDLQDepth(): Promise<number> {
    const counts = await dlqQueue.getJobCounts('waiting', 'delayed', 'failed');
    return (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.failed ?? 0);
  }

  async listDLQJobs(
    page = 1,
    limit = 20,
  ): Promise<{ total: number; page: number; limit: number; jobs: DLQJobSummary[] }> {
    const total = await this.getDLQDepth();
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);
    const start = (safePage - 1) * safeLimit;

    if (total === 0) {
      return { total: 0, page: safePage, limit: safeLimit, jobs: [] };
    }

    const fetchEnd = Math.min(total, 1000) - 1;
    const all = await dlqQueue.getJobs(['waiting', 'delayed', 'failed'], 0, fetchEnd);
    all.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    const pageJobs = all.slice(start, start + safeLimit);

    const jobs = pageJobs.map((job) => {
      const { message, details } = normalizeStoredDLQError(job.data?.error);
      return {
        id: job.id,
        originalQueue: job.data?.originalQueue ?? 'unknown',
        failedAt: job.data?.failedAt,
        error: message,
        errorDetails: details,
        aiCost: details.aiCost,
        payload: job.data?.data ?? null,
        documentType: job.data?.data?.type,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
      };
    });

    return { total, page: safePage, limit: safeLimit, jobs };
  }

  async replayDLQJob(id: string): Promise<{ replayedJobId: string | undefined; targetQueue: string }> {
    const job = await dlqQueue.getJob(id);
    if (!job) {
      throw Object.assign(new Error(`DLQ job ${id} not found.`), { statusCode: 404 });
    }

    const { originalQueue, data } = job.data;
    if (!originalQueue || !data) {
      throw Object.assign(
        new Error('Job payload is missing originalQueue or data fields. Cannot replay.'),
        { statusCode: 422 },
      );
    }

    const type = data?.type ?? 'WORKSHOP';
    const { queue: targetQueue } = resolveQueue(type);

    const replayedJob = await targetQueue.add(
      'extract-document',
      {
        ...data,
        replayedFromDLQ: true,
        replayedAt: new Date().toISOString(),
      },
      { priority: _config.QUEUE_PRIORITY_LOW },
    );

    await job.remove();

    logger.info(
      { dlqJobId: id, replayedJobId: replayedJob.id, targetQueue: targetQueue.name },
      'DLQ Admin: Job replayed successfully',
    );

    return { replayedJobId: replayedJob.id, targetQueue: targetQueue.name };
  }

  async discardDLQJob(id: string): Promise<void> {
    const job = await dlqQueue.getJob(id);
    if (!job) {
      throw Object.assign(new Error(`DLQ job ${id} not found.`), { statusCode: 404 });
    }

    const { originalQueue, data } = job.data;
    await job.remove();

    logger.warn(
      { dlqJobId: id, originalQueue, documentType: data?.type },
      'DLQ Admin: Job permanently discarded.',
    );
  }

  /** Called by DLQ worker when a failed job lands in the dead-letter queue. */
  async onDLQJobArrived(job: Job): Promise<void> {
    const { originalQueue, failedAt, error, data } = job.data;

    this.obs.warn('DLQ job arrived', {
      dlqJobId: job.id,
      originalQueue,
      failedAt,
      error,
      documentType: data?.type,
    });

    try {
      const depth = await this.getDLQDepth();
      this.obs.recordQueueDepth(DLQ_NAME, depth);

      const threshold = _config.DLQ_ALERT_THRESHOLD;
      if (depth > threshold) {
        this.obs.warn('DLQ depth exceeded threshold', {
          depth,
          threshold,
          latestJobId: job.id,
          documentType: data?.type,
        });
      }
    } catch (err) {
      this.obs.logError('Failed DLQ depth check after job arrival', err);
    }
  }

  /** Called when enqueue is rejected because waiting jobs >= MAX_QUEUE_SIZE. */
  async onQueueOverload(queueName: string, waitingCount: number): Promise<void> {
    const maxQueueSize = parseInt(_config.MAX_QUEUE_SIZE || '50', 10);

    this.obs.warn('Queue backpressure — requests rejected', {
      queueName,
      waitingCount,
      maxQueueSize,
    });
  }

  async getQueueHealth(): Promise<{ maxQueueSize: number; dlqThreshold: number; queues: QueueHealthRow[] }> {
    const maxQueueSize = parseInt(_config.MAX_QUEUE_SIZE || '50', 10);
    const rows: QueueHealthRow[] = [];

    for (const queue of ALL_QUEUES) {
      const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
      const waiting = counts.waiting ?? 0;
      rows.push({
        queueName: queue.name,
        waiting,
        active: counts.active ?? 0,
        delayed: counts.delayed ?? 0,
        failed: counts.failed ?? 0,
        overloaded: waiting >= maxQueueSize,
      });
    }

    const dlqDepth = await this.getDLQDepth();
    rows.push({
      queueName: DLQ_NAME,
      waiting: dlqDepth,
      active: 0,
      delayed: 0,
      failed: 0,
      overloaded: dlqDepth > _config.DLQ_ALERT_THRESHOLD,
    });

    return {
      maxQueueSize,
      dlqThreshold: _config.DLQ_ALERT_THRESHOLD,
      queues: rows,
    };
  }
}
