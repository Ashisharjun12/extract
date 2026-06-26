import {
  IObserverProvider,
  AIExecutionMetrics,
  QueueJobMetrics,
  JobCostSummary,
} from '../observer.interface.js';

// Composite observer provider.
// Fans out every telemetry call to all registered providers simultaneously.
// Default setup: [PinoObserverProvider, NewRelicObserverProvider]
//
// - Pino handles structured JSON logs (stdout / ELK / CloudWatch)
// - New Relic handles APM, custom metrics, custom events, and error analytics
export class CompositeObserverProvider implements IObserverProvider {
  constructor(private readonly providers: IObserverProvider[]) {}

  logAIExecution(metrics: AIExecutionMetrics): void {
    for (const p of this.providers) p.logAIExecution(metrics);
  }

  logJobCostSummary(summary: JobCostSummary, status: 'success' | 'failure'): void {
    for (const p of this.providers) p.logJobCostSummary(summary, status);
  }

  logQueueJob(metrics: QueueJobMetrics): void {
    for (const p of this.providers) p.logQueueJob(metrics);
  }

  logError(message: string, error?: Error | unknown, context?: Record<string, unknown>): void {
    for (const p of this.providers) p.logError(message, error, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    for (const p of this.providers) p.info(message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    for (const p of this.providers) p.warn(message, context);
  }

  recordQueueDepth(queueName: string, depth: number): void {
    for (const p of this.providers) p.recordQueueDepth(queueName, depth);
  }

  recordCircuitBreakerState(state: 'open' | 'halfOpen' | 'closed'): void {
    for (const p of this.providers) p.recordCircuitBreakerState(state);
  }
}
