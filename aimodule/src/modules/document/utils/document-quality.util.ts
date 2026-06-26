import { FileQualityHint, FetchedFileResult } from '../../../utils/file-fetcher.util.js';

export type DocumentQualityHint = FileQualityHint;

export interface QualityAwareResult {
  confidenceScore?: number;
  requiresHumanReview?: boolean;
  lowConfidenceFields?: string[] | null;
}

/** Worst-case quality hint when multiple files are uploaded (lowest confidence wins). */
export function getQualityHintFromInput(inputData: unknown): DocumentQualityHint | null {
  const items = normalizeFetchedItems(inputData);
  let worst: DocumentQualityHint | null = null;

  for (const item of items) {
    const hint = item.qualityHint;
    if (!hint) continue;
    if (!worst || hint.confidence < worst.confidence) {
      worst = hint;
    }
  }

  return worst;
}

function normalizeFetchedItems(inputData: unknown): FetchedFileResult[] {
  if (!inputData) return [];
  return Array.isArray(inputData) ? inputData : [inputData as FetchedFileResult];
}

/**
 * Merge prescreen blur/low-confidence into extraction output.
 * Blurry-but-readable uploads still extract; caller flags human review + caps confidence.
 */
export function mergeDocumentQuality<T extends QualityAwareResult>(
  result: T,
  hint: DocumentQualityHint | null,
  blurConfidenceThreshold: number,
): T {
  if (!hint) return result;

  const needsReview = hint.isBlurred || hint.confidence < blurConfidenceThreshold;
  if (!needsReview) return result;

  const cappedConfidence = Math.min(result.confidenceScore ?? 1, hint.confidence);
  const lowFields = new Set(
    Array.isArray(result.lowConfidenceFields) ? result.lowConfidenceFields : [],
  );
  lowFields.add('documentQuality');
  if (hint.isBlurred) lowFields.add('blurryScan');

  return {
    ...result,
    confidenceScore: cappedConfidence,
    requiresHumanReview: true,
    lowConfidenceFields: lowFields.size > 0 ? [...lowFields] : null,
  };
}
