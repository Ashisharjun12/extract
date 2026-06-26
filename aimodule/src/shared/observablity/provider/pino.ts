import { logger } from '../../../utils/logger.js';
import { getCorrelationId } from '../../context/correlation.context.js';
import {
  IObserverProvider,
  AIExecutionMetrics,
  QueueJobMetrics,
  JobCostSummary,
} from '../observer.interface.js';

export class PinoObserverProvider implements IObserverProvider {

  logAIExecution(metrics: AIExecutionMetrics): void {
    const correlationId = metrics.correlationId || getCorrelationId();
    const callNum = metrics.callIndex ?? '?';

    const summary =
      `[AI CALL #${callNum}] ${metrics.documentType} | ${metrics.callPhase} | ${metrics.model} | ` +
      `in=${metrics.promptTokens} out=${metrics.responseTokens} cached=${metrics.cachedTokens} | ` +
      `$${metrics.costUsd.toFixed(6)} / ₹${metrics.costINR.toFixed(6)} | ` +
      `key=${metrics.apiKeyLabel} | ${metrics.latencyMs}ms`;

    const payload = {
      event: 'ai_execution',
      callIndex: metrics.callIndex,
      documentType: metrics.documentType,
      jobId: metrics.jobId,
      apiKeyLabel: metrics.apiKeyLabel,
      callPhase: metrics.callPhase,
      model: metrics.model,
      pricingTier: metrics.pricingTier,
      cacheMode: metrics.cacheMode,
      promptTokens: metrics.promptTokens,
      responseTokens: metrics.responseTokens,
      cachedTokens: metrics.cachedTokens,
      totalTokens: metrics.totalTokens,
      costUsd: parseFloat(metrics.costUsd.toFixed(6)),
      costINR: parseFloat(metrics.costINR.toFixed(6)),
      savingsUsd: parseFloat(metrics.savingsUsd.toFixed(6)),
      latencyMs: metrics.latencyMs,
      status: metrics.status,
      correlationId,
    };

    if (metrics.status === 'success') {
      logger.info(payload, summary);
    } else {
      logger.error({ ...payload, error: metrics.error }, `${summary} | FAILED: ${metrics.error}`);
    }
  }

  logJobCostSummary(summary: JobCostSummary, status: 'success' | 'failure'): void {
    const headline =
      `[JOB TOTAL COST] ${summary.documentType} | job=${summary.jobId} | ${summary.apiCallCount} Gemini call(s) | ` +
      `tokens=${summary.totalTokens} (in=${summary.totalPromptTokens} out=${summary.totalResponseTokens}) | ` +
      `$${summary.totalCostUsd.toFixed(6)} / ₹${summary.totalCostINR.toFixed(6)} | ` +
      `saved=$${summary.totalSavingsUsd.toFixed(6)} | key=${summary.apiKeyLabel} | ${status.toUpperCase()}`;

    const perCall = summary.calls.map((c) =>
      `  #${c.callIndex} ${c.callPhase}: ${c.model} | in=${c.promptTokens} out=${c.responseTokens} | ` +
      `$${c.costUsd.toFixed(6)} / ₹${c.costINR.toFixed(6)} | ${c.latencyMs}ms | ${c.status}`,
    ).join('\n');

    const payload = {
      event: 'job_cost_summary',
      ...summary,
      jobStatus: status,
    };

    if (status === 'success') {
      logger.info(payload, `${headline}\n${perCall}`);
    } else {
      logger.warn(payload, `${headline}\n${perCall}`);
    }
  }

  logQueueJob(metrics: QueueJobMetrics): void {
    const correlationId = metrics.correlationId || getCorrelationId();
    const costPart = metrics.aiCostINR != null
      ? ` | AI total: $${metrics.aiCostUsd?.toFixed(6)} / ₹${metrics.aiCostINR.toFixed(6)} (${metrics.aiCallCount} calls)`
      : '';

    const payload = {
      event: 'queue_job',
      queue: metrics.queueName,
      jobId: metrics.jobId,
      documentType: metrics.documentType,
      attemptsMade: metrics.attemptsMade,
      durationMs: metrics.durationMs,
      status: metrics.status,
      correlationId,
      apiKeyLabel: metrics.apiKeyLabel,
      aiCostUsd: metrics.aiCostUsd,
      aiCostINR: metrics.aiCostINR,
      aiTotalTokens: metrics.aiTotalTokens,
      aiCallCount: metrics.aiCallCount,
      ...(metrics.errorStack && { errorStack: metrics.errorStack }),
    };

    if (metrics.status === 'success') {
      logger.info(payload, `[Queue] ${metrics.queueName} job=${metrics.jobId} | ${metrics.documentType} | ${metrics.durationMs}ms${costPart}`);
    } else {
      logger.error(payload, `[Queue] ${metrics.queueName} job=${metrics.jobId} FAILED (attempt ${metrics.attemptsMade})${costPart}`);
    }
  }

  logError(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    const err = error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : { message: String(error) };
    logger.error({ ...context, err, correlationId: getCorrelationId() }, message);
  }

  info(message: string, context?: Record<string, unknown>): void {
    logger.info({ ...context, correlationId: getCorrelationId() }, message);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    logger.warn({ ...context, correlationId: getCorrelationId() }, message);
  }

  recordQueueDepth(_queueName: string, _depth: number): void {}

  recordCircuitBreakerState(_state: 'open' | 'halfOpen' | 'closed'): void {}
}
