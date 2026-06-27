
export interface AIExecutionMetrics {
  model: string;
  documentType: string;
  documentName: string;   // e.g. 'vehicle_rc_front.jpg'
  documentId: string;     // e.g. DB record ID
  jobId: string;
  apiKeyLabel: string;
  callPhase: 'prescreen' | 'extraction';
  callIndex?: number;
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  cachedTokens: number;
  cacheMode: 'off' | 'implicit' | 'explicit';
  costUsd: number;
  costINR: number;
  savingsUsd: number;
  pricingTier: 'default' | 'lite' | 'pro';
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  cacheInputUsdPer1M: number;
  latencyMs: number;
  status: 'success' | 'failure';
  correlationId: string;
  error?: string;
}

export interface JobCostSummary {
  correlationId: string;
  documentType: string;
  documentName: string;
  documentId: string;
  jobId: string;
  apiKeyLabel: string;
  apiCallCount: number;
  totalPromptTokens: number;
  totalResponseTokens: number;
  totalTokens: number;
  totalCachedTokens: number;
  totalCostUsd: number;
  totalCostINR: number;
  totalSavingsUsd: number;
  calls: Array<{
    callIndex: number;
    callPhase: 'prescreen' | 'extraction';
    model: string;
    promptTokens: number;
    responseTokens: number;
    totalTokens: number;
    costUsd: number;
    costINR: number;
    latencyMs: number;
    status: 'success' | 'failure';
  }>;
}

export interface QueueJobMetrics {
  queueName: string;
  jobId: string | undefined;
  documentType: string;
  attemptsMade: number;
  durationMs: number;
  status: 'success' | 'failure';
  correlationId: string;
  errorStack?: string;
  /** Total Gemini cost for all API calls in this job */
  aiCostUsd?: number;
  aiCostINR?: number;
  aiTotalTokens?: number;
  aiCallCount?: number;
  apiKeyLabel?: string;
}

export interface IObserverProvider {
  /** Log a Gemini API call result with cost and latency. */
  logAIExecution(metrics: AIExecutionMetrics): void;

  /** Log total Gemini cost for a completed job (all API calls summed). */
  logJobCostSummary(summary: JobCostSummary, status: 'success' | 'failure'): void;

  /** Log a BullMQ job lifecycle event (completed or failed). */
  logQueueJob(metrics: QueueJobMetrics): void;

  /** Log a structured error with optional context payload. */
  logError(message: string, error?: Error | unknown, context?: Record<string, unknown>): void;

  /** Structured info log. */
  info(message: string, context?: Record<string, unknown>): void;

  /** Structured warn log. */
  warn(message: string, context?: Record<string, unknown>): void;

  /** Record current queue depth gauge (New Relic time-series). */
  recordQueueDepth(queueName: string, depth: number): void;

  /** Record circuit breaker state: closed=healthy, halfOpen=trial, open=paused. */
  recordCircuitBreakerState(state: 'open' | 'halfOpen' | 'closed'): void;
}
