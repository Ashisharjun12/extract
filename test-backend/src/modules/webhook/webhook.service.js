import { createHmac } from 'crypto';
import { ExtractionJob } from '../../model/extraction-job.schema.js';
import { _config } from '../../config/config.js';
import { ApiError } from '../../shared/apiError.js';

export class WebhookService {
  verifySignature(rawBody, receivedSig) {
    if (!_config.WEBHOOK_SECRET) {
      console.warn('[webhook] WEBHOOK_SECRET not set — skipping signature check');
      return true;
    }
    const expectedSig = createHmac('sha256', _config.WEBHOOK_SECRET)
      .update(rawBody ?? '')
      .digest('hex');
    return receivedSig === expectedSig;
  }

  async handleExtractionComplete(payload) {
    const correlationId = payload?.correlationId;
    if (!correlationId) {
      throw ApiError.badRequest('Missing correlationId in webhook payload.');
    }

    const update = {
      jobId: payload.jobId ?? undefined,
      durationMs: payload.durationMs ?? undefined,
    };

    if (payload.status === 'success') {
      update.status = 'completed';
      update.result = payload.result ?? null;
      update.error = null;
    } else {
      update.status = 'failed';
      update.error = payload.error ?? 'Extraction failed';
      update.result = null;
    }

    const job = await ExtractionJob.findOneAndUpdate(
      { correlationId },
      { $set: update },
      { new: true },
    );

    if (!job) {
      console.warn(`[webhook] Unknown correlationId: ${correlationId}`);
      return null;
    }

    console.log(`[webhook] Updated job ${job._id} → ${update.status} (${correlationId})`);
    return job;
  }
}
