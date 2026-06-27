import {
  IObserverProvider,
  AIExecutionMetrics,
  QueueJobMetrics,
  JobCostSummary,
} from '../observer.interface.js';

// New Relic observer provider.
// Records custom events and metrics to New Relic.
// Automatically injects the active correlationId from AsyncLocalStorage —
// no manual threading required.
// Queue depth and circuit-breaker state are no-ops here; those gauges are
// emitted to New Relic by NewRelicObserverProvider.

type NRAgent = {
  recordCustomEvent(eventType: string, attributes: Record<string, string | number | boolean>): void;
  recordMetric(name: string, value: number): void;
  incrementMetric(name: string, count?: number): void;
  noticeError(error: Error | string, customAttributes?: Record<string, string | number | boolean>): void;
};

function loadAgent(): NRAgent | null {
  try {
    // Agent is pre-loaded by instrument.ts — this just retrieves the handle
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('newrelic') as NRAgent;
  } catch {
    return null;
  }
}

export class NewRelicObserverProvider implements IObserverProvider {
  private readonly nr: NRAgent | null;

  constructor() {
    this.nr = loadAgent();
  }

  logAIExecution(metrics: AIExecutionMetrics): void {
    if (!this.nr) return;

    this.nr.recordCustomEvent('AIExecution', {
      model: metrics.model,
      documentType: metrics.documentType,
      documentName: metrics.documentName,
      documentId: metrics.documentId,
      jobId: metrics.jobId,
      apiKeyLabel: metrics.apiKeyLabel,
      callPhase: metrics.callPhase,
      callIndex: metrics.callIndex ?? 0,
      pricingTier: metrics.pricingTier,
      cacheMode: metrics.cacheMode,
      inputUsdPer1M: metrics.inputUsdPer1M,
      outputUsdPer1M: metrics.outputUsdPer1M,
      cacheInputUsdPer1M: metrics.cacheInputUsdPer1M,
      promptTokens: metrics.promptTokens,
      responseTokens: metrics.responseTokens,
      cachedTokens: metrics.cachedTokens,
      totalTokens: metrics.totalTokens,
      costUsd: metrics.costUsd,
      costINR: metrics.costINR,
      savingsUsd: metrics.savingsUsd,
      latencyMs: metrics.latencyMs,
      status: metrics.status,
      correlationId: metrics.correlationId,
      ...(metrics.error && { error: metrics.error }),
    });

    this.nr.recordMetric('Custom/AI/LatencyMs', metrics.latencyMs);
    this.nr.recordMetric('Custom/AI/TokenCostUSD', metrics.costUsd);
    this.nr.recordMetric('Custom/AI/TokenCostINR', metrics.costINR);
    this.nr.recordMetric('Custom/AI/CacheSavingsUSD', metrics.savingsUsd);
    this.nr.recordMetric('Custom/AI/CachedTokens', metrics.cachedTokens);
    this.nr.recordMetric('Custom/AI/TotalTokens', metrics.totalTokens);
    this.nr.recordMetric('Custom/AI/PromptTokens', metrics.promptTokens);
    this.nr.recordMetric('Custom/AI/ResponseTokens', metrics.responseTokens);

    this.nr.recordMetric(`Custom/AI/${metrics.documentType}/TokenCostINR`, metrics.costINR);

    if (metrics.status === 'failure' && metrics.error) {
      this.nr.noticeError(new Error(metrics.error), {
        model: metrics.model,
        correlationId: metrics.correlationId,
        source: 'AIExecution',
      });
    }
  }

  logJobCostSummary(summary: JobCostSummary, status: 'success' | 'failure'): void {
    if (!this.nr) return;

    this.nr.recordCustomEvent('JobCostSummary', {
      correlationId: summary.correlationId,
      documentType: summary.documentType,
      documentName: summary.documentName,
      documentId: summary.documentId,
      jobId: summary.jobId,
      apiKeyLabel: summary.apiKeyLabel,
      apiCallCount: summary.apiCallCount,
      totalPromptTokens: summary.totalPromptTokens,
      totalResponseTokens: summary.totalResponseTokens,
      totalTokens: summary.totalTokens,
      totalCachedTokens: summary.totalCachedTokens,
      totalCostUsd: summary.totalCostUsd,
      totalCostINR: summary.totalCostINR,
      totalSavingsUsd: summary.totalSavingsUsd,
      jobStatus: status,
    });

    this.nr.recordMetric(`Custom/Job/${summary.documentType}/TotalCostINR`, summary.totalCostINR);
    this.nr.recordMetric(`Custom/Job/${summary.documentType}/TotalTokens`, summary.totalTokens);
    this.nr.recordMetric('Custom/Job/TotalCostINR', summary.totalCostINR);
  }

  logQueueJob(metrics: QueueJobMetrics): void {
    if (!this.nr) return;

    this.nr.recordCustomEvent('QueueJob', {
      queueName: metrics.queueName,
      jobId: metrics.jobId ?? '',
      documentType: metrics.documentType,
      attemptsMade: metrics.attemptsMade,
      durationMs: metrics.durationMs,
      status: metrics.status,
      correlationId: metrics.correlationId,
      apiKeyLabel: metrics.apiKeyLabel ?? '',
      aiCostUsd: metrics.aiCostUsd ?? 0,
      aiCostINR: metrics.aiCostINR ?? 0,
      aiTotalTokens: metrics.aiTotalTokens ?? 0,
      aiCallCount: metrics.aiCallCount ?? 0,
    });

    this.nr.recordMetric(`Custom/Queue/${metrics.queueName}/DurationMs`, metrics.durationMs);

    if (metrics.status === 'failure') {
      this.nr.incrementMetric(`Custom/Queue/${metrics.queueName}/ErrorCount`);
    }
  }

  logError(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    if (!this.nr) return;
    const err = error instanceof Error ? error : new Error(String(error ?? message));
    this.nr.noticeError(err, {
      message,
      ...(context as Record<string, string | number | boolean> | undefined),
    });
  }

  // Structured info logs go through Pino — NR APM captures HTTP traces automatically
  info(_message: string, _context?: Record<string, unknown>): void {}

  warn(message: string, context?: Record<string, unknown>): void {
    if (!this.nr) return;
    this.nr.recordCustomEvent('AppWarning', {
      message,
      ...(context as Record<string, string | number | boolean> | undefined),
    });
  }

  recordQueueDepth(queueName: string, depth: number): void {
    if (!this.nr) return;
    this.nr.recordMetric(`Custom/Queue/${queueName}/Depth`, depth);
  }

  recordCircuitBreakerState(state: 'open' | 'halfOpen' | 'closed'): void {
    if (!this.nr) return;
    const stateValue = state === 'closed' ? 0 : state === 'halfOpen' ? 1 : 2;
    this.nr.recordMetric('Custom/CircuitBreaker/State', stateValue);
    this.nr.recordCustomEvent('CircuitBreakerStateChange', { state, stateValue });
  }
}
