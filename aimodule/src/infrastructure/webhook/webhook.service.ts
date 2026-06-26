import { createHmac } from 'crypto';
import { _config } from '../../config/config.js';
import { ObserverService } from '../observabllity/observer.service.js';

/**
 * WebhookService
 *
 * Pushes extraction results to the downstream receiver (Laravel backend) via
 * an HMAC-signed HTTP POST. The receiver URL is WEBHOOK_URL in .env.
 *
 * Security: every payload is signed with HMAC-SHA256(WEBHOOK_SECRET, body).
 * The receiver must verify the X-Webhook-Signature header before processing.
 *
 * Retry: up to MAX_ATTEMPTS with exponential backoff (1s, 2s, 4s).
 * If all retries fail the error is logged via ObserverService but does NOT
 * throw — webhook delivery is best-effort and must never crash the worker.
 */

export interface WebhookPayload {
  correlationId: string;
  jobId: string | undefined;
  documentType: string;
  status: 'success' | 'failure';
  result: unknown | null;
  error: string | null;
  durationMs: number;
  timestamp: string;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

function sign(body: string): string {
  const secret = _config.WEBHOOK_SECRET ?? '';
  return createHmac('sha256', secret).update(body).digest('hex');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class WebhookService {
  private readonly obs = ObserverService.getInstance();

  /**
   * Fire-and-forget push to WEBHOOK_URL.
   * Call this after every BullMQ job completes (success or failure).
   * Never throws — errors are logged and swallowed.
   */
  public async send(payload: WebhookPayload): Promise<void> {
    const url = _config.WEBHOOK_URL;
    if (!url) return; // webhook not configured — skip silently

    const body = JSON.stringify(payload);
    const signature = sign(body);

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Correlation-Id': payload.correlationId,
          },
          body,
          signal: AbortSignal.timeout(10_000), // 10s per attempt
        });

        if (res.ok) {
          this.obs.info('Webhook delivered', {
            url, jobId: payload.jobId, attempt, status: payload.status,
          });
          return;
        }

        this.obs.warn(`Webhook returned non-2xx on attempt ${attempt}`, {
          url, httpStatus: res.status, jobId: payload.jobId,
        });
      } catch (err) {
        this.obs.warn(`Webhook attempt ${attempt} failed (network/timeout)`, {
          url, jobId: payload.jobId, error: String(err),
        });
      }

      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_DELAY_MS * Math.pow(2, attempt - 1)); // 1s, 2s, 4s
      }
    }

    this.obs.logError(
      `Webhook delivery failed after ${MAX_ATTEMPTS} attempts — result dropped`,
      undefined,
      { url, jobId: payload.jobId, documentType: payload.documentType },
    );
  }
}
