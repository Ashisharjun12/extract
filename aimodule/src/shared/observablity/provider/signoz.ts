import {
  IObserverProvider,
  AIExecutionMetrics,
  QueueJobMetrics,
  JobCostSummary,
} from '../observer.interface.js';
import { OtelMetricsRegistry } from '../otel-metrics.js';
import { _config } from '../../../config/config.js';

/**
 * SigNoz / OpenTelemetry observer — custom business metrics via OTLP.
 * Mirrors NewRelicObserverProvider; active when OTEL_ENABLED=true.
 * No HTTP auto-instrumentation (avoids conflict with New Relic APM).
 */
export class SignozObserverProvider implements IObserverProvider {
  private get metrics(): OtelMetricsRegistry | null {
    if (_config.OTEL_ENABLED !== true) return null;
    return OtelMetricsRegistry.getInstance();
  }

  logAIExecution(m: AIExecutionMetrics): void {
    const otel = this.metrics;
    if (!otel) return;

    const attrs = {
      document_type: m.documentType,
      model: m.model,
      call_phase: m.callPhase,
      status: m.status,
      api_key_label: m.apiKeyLabel,
      correlation_id: m.correlationId,
      job_id: m.jobId,
    };

    otel.aiExecutionCalls.add(1, attrs);
    otel.aiExecutionCostInr.add(m.costINR, attrs);
    otel.aiExecutionLatencyMs.record(m.latencyMs, attrs);
    otel.aiExecutionTokens.add(m.totalTokens, {
      ...attrs,
      token_kind: 'total',
    });
  }

  logJobCostSummary(summary: JobCostSummary, status: 'success' | 'failure'): void {
    const otel = this.metrics;
    if (!otel) return;

    const attrs = {
      document_type: summary.documentType,
      status,
      api_key_label: summary.apiKeyLabel,
      correlation_id: summary.correlationId,
      job_id: summary.jobId,
    };

    otel.jobTotalCostInr.add(summary.totalCostINR, attrs);
    otel.jobTotalTokens.add(summary.totalTokens, attrs);
  }

  logQueueJob(m: QueueJobMetrics): void {
    const otel = this.metrics;
    if (!otel) return;

    const attrs = {
      queue_name: m.queueName,
      document_type: m.documentType,
      status: m.status,
      correlation_id: m.correlationId,
      job_id: m.jobId ?? '',
    };

    otel.queueJobCalls.add(1, attrs);
    otel.queueJobDurationMs.record(m.durationMs, attrs);
  }

  logError(_message: string, _error?: Error | unknown, _context?: Record<string, unknown>): void {
    // Errors captured in Pino logs; add OTel log export when NR is removed.
  }

  info(_message: string, _context?: Record<string, unknown>): void {}

  warn(_message: string, _context?: Record<string, unknown>): void {}

  recordQueueDepth(queueName: string, depth: number): void {
    this.metrics?.setQueueDepth(queueName, depth);
  }

  recordCircuitBreakerState(state: 'open' | 'halfOpen' | 'closed'): void {
    this.metrics?.setCircuitBreakerState(state);
  }
}
