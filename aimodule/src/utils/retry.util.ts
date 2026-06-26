import { ObserverService } from '../infrastructure/observabllity/observer.service.js';
import { ApiError } from '../shared/errors/apiError.js';
import { UnrecoverableDocumentError } from '../shared/errors/document.errors.js';

export class RetryUtil {
  public static async execute<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        return await fn();
      } catch (error: any) {
        attempt++;

        if (this.isRetryable(error) && attempt < maxRetries) {
          const delayMs = Math.pow(2, attempt) * 1000;
          ObserverService.getInstance().warn(
            `[RetryUtil] Attempt ${attempt} failed. Retrying in ${delayMs}ms`,
            { reason: error?.message },
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        throw error;
      }
    }

    throw new Error('Retry limit exceeded.');
  }

  private static isRetryable(error: any): boolean {
    if (!error) return false;

    // Content / business errors — already billed once, never retry
    if (error instanceof UnrecoverableDocumentError) return false;

    const message = (error.message || '').toLowerCase();

    if (
      message.includes('wrong_document_type') ||
      message.includes('unreadable_document') ||
      message.includes('response_truncated') ||
      message.includes('max_tokens')
    ) {
      return false;
    }

    if (ApiError.isQuotaError(error)) return true;

    const status = error.status || error.statusCode || error.code;

    if (status === 502 || status === 503 || status === 504 || message.includes('timeout') || message.includes('econnrefused')) {
      return true;
    }

    // Network / socket errors — transient, always retry
    if (
      message.includes('fetch failed') ||
      message.includes('econnreset') ||
      message.includes('other side closed') ||
      message.includes('socket') ||
      error?.cause?.name === 'SocketError' ||
      error?.cause?.code === 'ECONNRESET'
    ) {
      return true;
    }

    if (message.includes('json_parse_error')) {
      const isTruncation =
        message.includes('unterminated') ||
        message.includes('at position') ||
        message.includes('max_tokens') ||
        message.includes('response_truncated');
      return !isTruncation;
    }

    return false;
  }
}
