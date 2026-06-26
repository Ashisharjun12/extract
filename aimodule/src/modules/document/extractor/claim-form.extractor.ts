import { ZodError } from 'zod';
import { AIService } from '../../../infrastructure/ai/ai.service';
import { ClaimFormGeminiSchema } from '../schema/claim/claim-form.gemini.schema';
import { ClaimFormSchema } from '../schema/claim/claim-form.schema';
import { getClaimFormPrompt } from '../prompts/claim-form.prompt';
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
import { UnrecoverableDocumentError } from '../../../shared/errors/document.errors.js';
import { _config } from '../../../config/config';

const MAX_OUTPUT_TOKENS = 1024;

export class ClaimFormExtractor {
  private aiService: AIService;
  private obs = ObserverService.getInstance();

  constructor() {
    this.aiService = AIService.getInstance();
  }

  public async extract(inputData: unknown) {
    this.obs.info('ClaimFormExtractor: Starting extraction');

    const rawResult = await this.aiService.processDocument(
      inputData,
      getClaimFormPrompt(),
      ClaimFormGeminiSchema,
      MAX_OUTPUT_TOKENS,
      _config.DL_AI_MODEL,
      _config.DL_MAX_GEMINI_RETRIES,
      'CLAIM',
    );

    let parsedResult;
    try {
      parsedResult = ClaimFormSchema.parse(rawResult);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new UnrecoverableDocumentError(
          'EXTRACTION_SCHEMA_FAILED',
          'Claim form structure could not be validated. Re-upload a clearer scan of the claim form.',
        );
      }
      throw e;
    }

    enforceDocumentTypeGates(parsedResult, {
      extractorName: 'ClaimFormExtractor',
      wrongTypeMessage: (typeStr) =>
        `The uploaded document appears to be a "${typeStr}", not a Claim Form. ` +
        'Please upload a valid motor insurance claim / intimation form.',
      mixedBatchMessage: (pageList) =>
        `Mixed document batch detected for Claim Form extraction. ${pageList} ` +
        'Please ensure all uploaded pages belong to the same claim form.',
    });

    const confidence = parsedResult.confidenceScore ?? 0;
    const hasNoClaimIdentifiers =
      isEffectivelyEmpty(parsedResult.claimNo) &&
      isEffectivelyEmpty(parsedResult.dateOfLoss) &&
      isEffectivelyEmpty(parsedResult.natureOfLoss);

    if (hasNoClaimIdentifiers) {
      rejectWrongTypeOrUnreadable(
        'ClaimFormExtractor',
        confidence,
        confidence >= 0.3,
        'The uploaded document does not appear to be a motor insurance Claim Form. ' +
          'Please upload a valid claim intimation or accident report form.',
        'The uploaded claim form could not be read. ' +
          'Please ensure the image is clear and shows the full claim form. ' +
          'Re-upload a higher quality scan.',
      );
    }

    this.obs.info(
      `ClaimFormExtractor: Extraction complete — claimNo=${parsedResult.claimNo ?? 'N/A'}, ` +
        `confidence=${parsedResult.confidenceScore}`,
    );

    return mergeDocumentQuality(
      parsedResult,
      getQualityHintFromInput(inputData),
      _config.PRESCREEN_BLUR_CONFIDENCE,
    );
  }
}
