import { UnrecoverableError } from 'bullmq';

/**
 * Thrown when a document is confirmed to be unreadable or the wrong type.
 *
 * Extends BullMQ's `UnrecoverableError` — this tells BullMQ to SKIP all
 * remaining retry attempts and move the job straight to failed/DLQ on the
 * FIRST attempt.
 *
 * Use this for CONTENT errors (wrong doc type, blank page, wrong URL),
 * NOT for transient system errors (network timeouts, Gemini 503, etc.)
 * which should still retry normally.
 *
 * Cost impact: 1 Gemini API call instead of 3.
 */
export class UnrecoverableDocumentError extends UnrecoverableError {
  public readonly code: string;

  constructor(code: string, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.name = 'UnrecoverableDocumentError';
  }
}
