import { QueueEvents } from 'bullmq';
import { bullmqConnection } from '../connection.js';
import { dlqQueue, DLQ_NAME } from './dlq.queue.js';
import { ObserverService } from '../../observabllity/observer.service.js';
import { _config } from '../../../config/config.js';
import { AdminService } from '../../../modules/admin/admin.service.js';

const obs = ObserverService.getInstance();
const adminService = new AdminService();

/** Listen for new DLQ jobs — do NOT run a Worker that completes them (admin UI lists waiting jobs). */
export const dlqQueueEvents = new QueueEvents(DLQ_NAME, {
  connection: bullmqConnection.duplicate() as any,
  prefix: _config.QUEUE_PREFIX,
});

dlqQueueEvents.on('added', async ({ jobId }) => {
  try {
    const job = await dlqQueue.getJob(jobId);
    if (job) await adminService.onDLQJobArrived(job);
  } catch (err) {
    obs.logError('DLQ Events: failed to handle added job', err as Error, { dlqJobId: jobId });
  }
});

dlqQueueEvents.on('error', (err) => {
  obs.logError('DLQ QueueEvents error', err);
});

obs.info('DLQ QueueEvents listener initialized for dead-letter-queue monitoring');
