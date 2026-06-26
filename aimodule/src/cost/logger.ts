import { ObserverService } from '../infrastructure/observabllity/observer.service.js';
import type { AIExecutionMetrics, JobCostSummary } from '../shared/observablity/observer.interface.js';
import {
  correlationStore,
  getCorrelationId,
} from '../shared/context/correlation.context.js';
import {
  recordAICall,
  getDocumentType,
  getJobId,
  getApiKeyLabel,
} from './tracker.js';
import type { AICallPhase, CostBreakdown } from './types.js';

interface LogGeminiCallParams {
  model: string;
  promptTokens: number;
  responseTokens: number;
  totalTokens: number;
  cachedTokens: number;
  cacheMode: AIExecutionMetrics['cacheMode'];
  cost: CostBreakdown;
  latencyMs: number;
  status: 'success' | 'failure';
  callPhase?: AICallPhase;
  error?: string;
}

export function logGeminiCall(params: LogGeminiCallParams): void {
  const correlationId = getCorrelationId();
  const callPhase = params.callPhase ?? 'extraction';
  const callIndex = (correlationStore.getStore()?.cost.apiCallCount ?? 0) + 1;

  const metrics: AIExecutionMetrics = {
    model: params.model,
    documentType: getDocumentType(),
    jobId: getJobId(),
    apiKeyLabel: getApiKeyLabel(),
    callPhase,
    callIndex,
    promptTokens: params.promptTokens,
    responseTokens: params.responseTokens,
    totalTokens: params.totalTokens,
    cachedTokens: params.cachedTokens,
    cacheMode: params.cacheMode,
    costUsd: params.cost.costUsd,
    costINR: params.cost.costINR,
    savingsUsd: params.cost.savingsUsd,
    pricingTier: params.cost.pricingTier,
    inputUsdPer1M: params.cost.inputUsdPer1M,
    outputUsdPer1M: params.cost.outputUsdPer1M,
    cacheInputUsdPer1M: params.cost.cacheInputUsdPer1M,
    latencyMs: params.latencyMs,
    status: params.status,
    correlationId,
    error: params.error,
  };

  ObserverService.getInstance().logAIExecution(metrics);

  recordAICall({
    callPhase,
    model: params.model,
    promptTokens: params.promptTokens,
    responseTokens: params.responseTokens,
    totalTokens: params.totalTokens,
    cachedTokens: params.cachedTokens,
    costUsd: params.cost.costUsd,
    costINR: params.cost.costINR,
    savingsUsd: params.cost.savingsUsd,
    latencyMs: params.latencyMs,
    status: params.status,
  });
}

export function logJobCostSummary(summary: JobCostSummary, status: 'success' | 'failure'): void {
  ObserverService.getInstance().logJobCostSummary(summary, status);
}
