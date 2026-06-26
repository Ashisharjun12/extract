import { metrics, type Counter, type Histogram, type ObservableResult } from '@opentelemetry/api';
import { isOtelReady } from '../../instrument-otel.js';

/** OTel metric instruments — mirrors New Relic custom metrics for SigNoz dashboards. */
export class OtelMetricsRegistry {
  private static instance: OtelMetricsRegistry | null = null;

  readonly aiExecutionCostInr: Counter;
  readonly aiExecutionCalls: Counter;
  readonly aiExecutionLatencyMs: Histogram;
  readonly aiExecutionTokens: Counter;
  readonly jobTotalCostInr: Counter;
  readonly jobTotalTokens: Counter;
  readonly queueJobCalls: Counter;
  readonly queueJobDurationMs: Histogram;

  private readonly queueDepths = new Map<string, number>();
  private circuitBreakerState = 0;

  private constructor() {
    const meter = metrics.getMeter('docs-intelligence', '1.0.0');

    this.aiExecutionCostInr = meter.createCounter('ai.execution.cost_inr', {
      description: 'Gemini cost in INR per API call',
    });
    this.aiExecutionCalls = meter.createCounter('ai.execution.calls', {
      description: 'Gemini API call count',
    });
    this.aiExecutionLatencyMs = meter.createHistogram('ai.execution.latency_ms', {
      description: 'Gemini API call latency in milliseconds',
      unit: 'ms',
    });
    this.aiExecutionTokens = meter.createCounter('ai.execution.tokens', {
      description: 'Gemini tokens consumed (prompt + response)',
    });

    this.jobTotalCostInr = meter.createCounter('job.total_cost_inr', {
      description: 'Total Gemini cost in INR per completed job',
    });
    this.jobTotalTokens = meter.createCounter('job.total_tokens', {
      description: 'Total tokens per completed job',
    });

    this.queueJobCalls = meter.createCounter('queue.job.calls', {
      description: 'BullMQ job completion count',
    });
    this.queueJobDurationMs = meter.createHistogram('queue.job.duration_ms', {
      description: 'BullMQ job duration in milliseconds',
      unit: 'ms',
    });

    const queueDepthGauge = meter.createObservableGauge('queue.depth', {
      description: 'Waiting jobs per BullMQ queue',
    });
    queueDepthGauge.addCallback((result: ObservableResult) => {
      for (const [queueName, depth] of this.queueDepths) {
        result.observe(depth, { queue_name: queueName });
      }
    });

    const circuitGauge = meter.createObservableGauge('circuit_breaker.state', {
      description: 'Gemini circuit breaker: 0=closed, 1=halfOpen, 2=open',
    });
    circuitGauge.addCallback((result: ObservableResult) => {
      result.observe(this.circuitBreakerState);
    });
  }

  static getInstance(): OtelMetricsRegistry | null {
    if (!isOtelReady()) return null;
    if (!OtelMetricsRegistry.instance) {
      OtelMetricsRegistry.instance = new OtelMetricsRegistry();
    }
    return OtelMetricsRegistry.instance;
  }

  setQueueDepth(queueName: string, depth: number): void {
    this.queueDepths.set(queueName, depth);
  }

  setCircuitBreakerState(state: 'open' | 'halfOpen' | 'closed'): void {
    this.circuitBreakerState = state === 'closed' ? 0 : state === 'halfOpen' ? 1 : 2;
  }
}
