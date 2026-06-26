// insurance
import { ZodError } from 'zod';
import { AIService } from '../../../infrastructure/ai/ai.service';
import { UnrecoverableDocumentError } from '../../../shared/errors/document.errors.js';
import { PolicySinglePassGeminiSchema } from '../schema/policy/insurance-policy.gemini.schema';
import { InsurancePolicySchema } from '../schema/policy/insurance-policy.schema';
import { getInsurancePolicySinglePassPrompt } from '../prompts/insurance-policy.prompt';
import {
  derivePolicyCoverage,
  normalizeStrictPolicyFields,
} from '../utils/policy/insurance-policy.utils';
import { mergePolicyConfidence, mergePolicyPasses } from '../utils/policy/policy-gemini-flatten.util.js';
import { buildSliceInput, getPrimaryFileInput } from '../utils/pdf-slice.util.js';
import { defaultPolicyPageSplit, policyExtractPageIndices } from '../utils/policy/policy-pdf-slice.util.js';
import { ObserverService } from '../../../infrastructure/observabllity/observer.service.js';
import {
  enforceDocumentTypeGates,
  isEffectivelyEmpty,
  rejectWrongTypeOrUnreadable,
} from '../utils/document-gates.util.js';
import {
  getQualityHintFromInput,
  mergeDocumentQuality,
} from '../utils/document-quality.util.js';
import { _config } from '../../../config/config';
import { computePolicyMaxTokens } from '../../../cost/token-budget.js';
import { resolveDocumentPageCount } from '../../../utils/document-page-count.util.js';
import { shouldPolicyMultipassFallback } from '../../../utils/gemini-truncation.util.js';

type PolicyExtractionMode = 'single-pass' | 'single-pass-retry';

export class InsurancePolicyExtractor {
  private aiService: AIService;
  private obs = ObserverService.getInstance();

  constructor() {
    this.aiService = AIService.getInstance();
  }

  private parsePolicyResult(raw: unknown) {
    try {
      const normalized = normalizeStrictPolicyFields(raw as Record<string, unknown>);
      return InsurancePolicySchema.parse(normalized);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new UnrecoverableDocumentError(
          'EXTRACTION_SCHEMA_FAILED',
          'Insurance policy structure could not be validated. Re-upload a clearer PDF or a standard motor policy.',
        );
      }
      throw e;
    }
  }

  private async callGemini(
    inputData: unknown,
    prompt: string,
    schema: Parameters<AIService['processDocument']>[2],
    maxOutputTokens: number,
    cacheKey: string,
  ) {
    return this.aiService.processDocument(
      inputData,
      prompt,
      schema,
      maxOutputTokens,
      _config.POLICY_AI_MODEL,
      _config.POLICY_MAX_GEMINI_RETRIES,
      cacheKey,
    );
  }

  private flattenSinglePass(raw: Record<string, unknown>): Record<string, unknown> {
    const flat = mergePolicyPasses(raw);
    const quality = mergePolicyConfidence({
      confidenceScore: raw.confidenceScore as number | undefined,
      requiresHumanReview: raw.requiresHumanReview as boolean | undefined,
    });
    return normalizeStrictPolicyFields({ ...flat, ...quality });
  }

  private resolveExtractPages(pageCount: number): number[] | null {
    return pageCount >= 3 ? policyExtractPageIndices(pageCount) : null;
  }

  private async extractSinglePass(
    inputData: unknown,
    pageCount: number,
    maxTokensOverride?: number,
    cacheKey = 'POLICY',
  ) {
    const hasLocalPdf = Boolean(getPrimaryFileInput(inputData)?.localPdfPath);
    const extractPages = this.resolveExtractPages(pageCount);
    const effectivePageCount = extractPages?.length ?? pageCount;
    const maxTokens =
      maxTokensOverride ?? computePolicyMaxTokens(effectivePageCount, _config.POLICY_MAX_OUTPUT_TOKENS);

    this.obs.info(
      `InsurancePolicyExtractor: Single-pass — ${pageCount} page(s), ` +
        `extractPages=${extractPages?.join(',') ?? 'all'}, maxOutputTokens=${maxTokens}`,
    );

    let callInput = inputData;
    let disposeSlice: (() => Promise<void>) | undefined;

    if (hasLocalPdf && extractPages && extractPages.length < pageCount) {
      const slice = await buildSliceInput(inputData, extractPages, 'policy-single-pass');
      callInput = slice.input;
      disposeSlice = slice.dispose;
      this.obs.info(
        `InsurancePolicyExtractor: PDF slice pages ${extractPages.join(',')} ` +
          `(skip: ${defaultPolicyPageSplit(pageCount).skipPageIndices.join(',') || 'none'})`,
      );
    }

    try {
      const raw = await this.callGemini(
        callInput,
        getInsurancePolicySinglePassPrompt(),
        PolicySinglePassGeminiSchema,
        maxTokens,
        cacheKey,
      );
      return this.flattenSinglePass(raw as Record<string, unknown>);
    } finally {
      if (disposeSlice) await disposeSlice();
    }
  }

  /**
   * Single-pass first; on truncation ONE retry with higher token budget.
   * No multipass (gate+data+premium) — avoids ₹3–4 wasted on failure.
   */
  private async extractWithFallback(
    inputData: unknown,
    pageCount: number,
  ): Promise<{ raw: Record<string, unknown>; mode: PolicyExtractionMode }> {
    try {
      const raw = await this.extractSinglePass(inputData, pageCount);
      return { raw, mode: 'single-pass' };
    } catch (err) {
      if (!shouldPolicyMultipassFallback(err)) throw err;

      const extractPages = this.resolveExtractPages(pageCount);
      const effectivePageCount = extractPages?.length ?? pageCount;
      const baseBudget = computePolicyMaxTokens(effectivePageCount, _config.POLICY_MAX_OUTPUT_TOKENS);
      const retryBudget = Math.min(32768, baseBudget + 8192);

      this.obs.warn(
        'InsurancePolicyExtractor: Single-pass failed — one retry only (multipass disabled for cost)',
        { pageCount, baseBudget, retryBudget },
      );

      try {
        const raw = await this.extractSinglePass(
          inputData,
          pageCount,
          retryBudget,
          'POLICY-RETRY',
        );
        return { raw, mode: 'single-pass-retry' };
      } catch {
        throw new UnrecoverableDocumentError(
          'EXTRACTION_TRUNCATED',
          'Policy output exceeded token limit. Re-upload a clearer PDF or a shorter policy document.',
        );
      }
    }
  }

  public async extract(inputData: unknown) {
    const fileCount = Array.isArray(inputData) ? inputData.length : 1;
    const pageCount = resolveDocumentPageCount(inputData);

    this.obs.info(
      `InsurancePolicyExtractor: Starting — ${fileCount} file(s), ${pageCount} page(s), ` +
        `strategy=strict-single-pass, maxRetries=1`,
    );

    const { raw: rawResult, mode: extractionMode } = await this.extractWithFallback(
      inputData,
      pageCount,
    );

    enforceDocumentTypeGates(rawResult, {
      extractorName: 'InsurancePolicyExtractor',
      wrongTypeMessage: (typeStr) =>
        `The uploaded document appears to be a "${typeStr}", not an Insurance Policy. ` +
        'Please upload a valid Motor Insurance Policy (Package, OD, Bundled, or TP-Only).',
      mixedBatchMessage: (pageList) =>
        `Mixed document batch detected for Insurance Policy extraction. ${pageList} ` +
        'Please ensure all uploaded pages belong to the same insurance policy.',
    });

    this.obs.info('InsurancePolicyExtractor: Raw extraction complete, validating with Zod...');

    const parsedResult = this.parsePolicyResult(rawResult);

    const confidence = parsedResult.confidenceScore ?? 0;
    const noPolicyIdentifier = isEffectivelyEmpty(parsedResult.policyNumber);
    const noPremium = !parsedResult.grossPremiumPaid || parsedResult.grossPremiumPaid <= 0;

    if (noPolicyIdentifier && noPremium) {
      rejectWrongTypeOrUnreadable(
        'InsurancePolicyExtractor',
        confidence,
        confidence >= 0.3,
        'The uploaded document does not appear to be an Insurance Policy. ' +
          'Please upload the correct document. ' +
          'Supported formats: Motor Insurance Policy PDF (Package, OD, Bundled, or TP-Only).',
        'The uploaded document could not be read. ' +
          'Please ensure the PDF/image is clear and shows the full insurance policy. ' +
          'Re-upload a higher quality scan.',
      );
    }

    const policyCoverage = derivePolicyCoverage(parsedResult.policyType);

    const enriched = {
      ...parsedResult,
      policyCoverage,
      requiresHumanReview: parsedResult.requiresHumanReview,
      extractionMode,
    };

    this.obs.info(
      `InsurancePolicyExtractor: Extraction successful — ` +
        `pages=${pageCount}, mode=${extractionMode}, ` +
        `policyNo=${enriched.policyNumber ?? 'N/A'} | ` +
        `coverage=${policyCoverage} | ` +
        `grossPremium=₹${enriched.grossPremiumPaid ?? 'N/A'} | ` +
        `confidence=${enriched.confidenceScore} | ` +
        `humanReview=${enriched.requiresHumanReview}`,
    );

    return mergeDocumentQuality(
      enriched,
      getQualityHintFromInput(inputData),
      _config.PRESCREEN_BLUR_CONFIDENCE,
    );
  }
}
