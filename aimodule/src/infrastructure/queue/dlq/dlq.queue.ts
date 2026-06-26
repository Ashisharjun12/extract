import { Queue } from 'bullmq';
import { bullmqConnection } from '../connection.js';
import { _config } from '../../../config/config.js';
import type { DLQErrorRecord } from './dlq.error.util.js';

export const DLQ_NAME = 'dead-letter-queue';

const PREFIX = _config.QUEUE_PREFIX;

export const dlqQueue = new Queue(DLQ_NAME, {
  connection: bullmqConnection as any,
  prefix: PREFIX,
  defaultJobOptions: {
    // Keep jobs until an admin replays or discards via the admin API.
    removeOnComplete: false,
    removeOnFail: { count: 500, age: 604800 }, // 604800s = 7 days
  },
  skipVersionCheck: true,
});


// add the dead letter job
export const addDeadLetterJob = async (
  queueName: string,
  jobData: any,
  errorRecord: DLQErrorRecord,
) => {
  return await dlqQueue.add('failed-job', {
    originalQueue: queueName,
    failedAt: new Date().toISOString(),
    error: errorRecord,
    data: jobData,
  });
};
