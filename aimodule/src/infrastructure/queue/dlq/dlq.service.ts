import { addDeadLetterJob } from './dlq.queue.js';
import { serializeDLQError } from './dlq.error.util.js';
import { Job, UnrecoverableError } from 'bullmq';
import { ObserverService } from '../../observabllity/observer.service.js';
import type { JobCostSummary } from '../../../cost/types.js';

export class DLQService {
  private obs = ObserverService.getInstance();

  public async handleFailedJob(job: Job | undefined, err: Error, queueName: string): Promise<void> {
    if (!job) return;

    this.obs.logError(`${queueName} Job failed`, err, { jobId: job.id });

    const maxAttempts = job.opts.attempts || 3;

    // unrecoverable error (e.g. UNREADABLE_DOCUMENT, wrong doc type) bypasses retries entirely.
    // BullMQ fires 'failed' on the first attempt — we must check this explicitly, otherwise
    // attemptsMade (1) < maxAttempts (3) and the job would never reach DLQ.
    const isUnrecoverable = err instanceof UnrecoverableError;
    const isExhausted = job.attemptsMade >= maxAttempts;

    if (isUnrecoverable || isExhausted) {
      const reason = isUnrecoverable ? 'non-retryable content error' : 'all retries exhausted';
      this.obs.warn('Moving job to Dead Letter Queue', { jobId: job.id, queue: queueName, reason });

      try {
        const costSummary = (err as Error & { costSummary?: JobCostSummary }).costSummary;
        await addDeadLetterJob(
          queueName,
          job.data,
          serializeDLQError(err, job, reason, costSummary),
        );
        await job.remove();
        this.obs.info('Job moved to DLQ and removed from main queue', { jobId: job.id, queueName });
      } catch (dlqErr: any) {
        this.obs.logError('Failed to move job to Dead Letter Queue', dlqErr, { jobId: job.id });
      }
    }
  }
}
