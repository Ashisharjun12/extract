import { AIService } from '../../../infrastructure/ai/ai.service.js';
import { ObserverService } from '../../../infrastructure/observabllity/observer.service.js';
import { UnrecoverableDocumentError } from '../../../shared/errors/document.errors.js';
import { _config } from '../../../config/config.js';
import { FetchedFileResult } from '../../../utils/file-fetcher.util.js';
import { buildSliceInput } from '../utils/pdf-slice.util.js';
import { DocumentQualityHint } from '../utils/document-quality.util.js';

const PRESCREEN_PROMPT = `You are a document quality gate before OCR/extraction.
Assess whether the document is readable enough for data extraction.
For multi-page PDFs, judge the overall scan quality (focus on the first visible content).
Answer ONLY with JSON matching the schema.
Rules:
- isReadable=true if text/numbers are legible enough for OCR/extraction (even if slightly soft)
- isReadable=false ONLY if text is genuinely illegible (blank, extreme blur, fully obscured)
- isBlurred=true if motion blur, heavy compression, out-of-focus, or low-resolution scan
- confidence 0.0–1.0 (overall readability for extraction)
- reason: one short sentence describing quality (e.g. "Slightly blurry but text legible" or "Heavy motion blur")`;

const PRESCREEN_SCHEMA = {
  type: 'object',
  properties: {
    isReadable: { type: 'boolean' },
    isBlurred: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['isReadable', 'isBlurred', 'confidence', 'reason'],
};

interface PrescreenRawResult {
  isReadable?: boolean;
  isBlurred?: boolean;
  confidence?: number;
  reason?: string;
}

/**
 * Cheap Flash-Lite pre-check before full extraction.
 * - Images: always prescreen (1 optimized JPEG)
 * - PDFs with pageCount <= PRESCREEN_MAX_PDF_PAGES: prescreen whole file
 * - PDFs above page limit: prescreen page 1 only (when PRESCREEN_LARGE_PDF_PAGE1=true)
 * - Multiple URLs: prescreen each eligible file
 *
 * Unreadable → reject (DLQ). Blurry-but-readable → attach qualityHint for human-review flag.
 */
export class DocumentPrescreenService {
  private ai = AIService.getInstance();
  private obs = ObserverService.getInstance();

  async check(inputData: unknown, documentType: string): Promise<void> {
    if (_config.PRESCREEN_ENABLED === 'false') return;

    const items = this.normalizeItems(inputData);
    if (items.length === 0) return;

    const model = _config.PRESCREEN_MODEL ?? _config.AI_MODEL_LITE ?? _config.AI_MODEL ?? 'gemini-2.5-flash-lite';
    const maxOutputTokens = _config.PRESCREEN_MAX_OUTPUT_TOKENS;
    const maxPdfPages = _config.PRESCREEN_MAX_PDF_PAGES;
    const largePdfPage1 = _config.PRESCREEN_LARGE_PDF_PAGE1 !== 'false';

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const mime = item.fileData?.mimeType ?? '';
      const pages = item.pageCount ?? 1;
      const isPdf = mime === 'application/pdf';
      const exceedsPageLimit = isPdf && pages > maxPdfPages;

      if (exceedsPageLimit && !largePdfPage1) {
        this.obs.info('DocumentPrescreen: skipped (PDF exceeds page limit)', {
          documentType,
          fileIndex: i + 1,
          pageCount: pages,
          maxPdfPages,
        });
        continue;
      }

      if (exceedsPageLimit && largePdfPage1) {
        await this.runPageOneCheck(item, documentType, model, maxOutputTokens, i + 1, items.length);
        continue;
      }

      await this.runSingleCheck(item, item, documentType, model, maxOutputTokens, i + 1, items.length);
    }
  }

  private normalizeItems(inputData: unknown): FetchedFileResult[] {
    if (!inputData) return [];
    return Array.isArray(inputData) ? inputData : [inputData as FetchedFileResult];
  }

  /** Prescreen only page 1 of large PDFs — cheap blur check without sending all pages. */
  private async runPageOneCheck(
    targetItem: FetchedFileResult,
    documentType: string,
    model: string,
    maxOutputTokens: number,
    fileIndex: number,
    totalFiles: number,
  ): Promise<void> {
    this.obs.info('DocumentPrescreen: page-1 quality check for large PDF', {
      documentType,
      fileIndex,
      totalFiles,
      pageCount: targetItem.pageCount ?? 1,
    });

    const slice = await buildSliceInput(targetItem, [1], 'prescreen-p1');
    try {
      await this.runSingleCheck(targetItem, slice.input, documentType, model, maxOutputTokens, fileIndex, totalFiles);
    } finally {
      await slice.dispose();
    }
  }

  private async runSingleCheck(
    targetItem: FetchedFileResult,
    aiInput: FetchedFileResult | { fileData?: { fileUri: string; mimeType: string }; pageCount?: number },
    documentType: string,
    model: string,
    maxOutputTokens: number,
    fileIndex: number,
    totalFiles: number,
  ): Promise<void> {
    this.obs.info('DocumentPrescreen: running Flash-Lite quality check', {
      documentType,
      model,
      fileIndex,
      totalFiles,
      pageCount: 'pageCount' in aiInput ? aiInput.pageCount ?? 1 : 1,
      mimeType: aiInput.fileData?.mimeType,
    });

    const result = (await this.ai.processDocument(
      aiInput,
      PRESCREEN_PROMPT,
      PRESCREEN_SCHEMA,
      maxOutputTokens,
      model,
      1,
      undefined,
      'prescreen',
    )) as PrescreenRawResult;

    const hint = this.evaluatePrescreenResult(result, documentType, fileIndex);
    if (hint) {
      targetItem.qualityHint = hint;
    }
  }

  private evaluatePrescreenResult(
    result: PrescreenRawResult,
    documentType: string,
    fileIndex: number,
  ): DocumentQualityHint | null {
    const rejectThreshold = _config.PRESCREEN_REJECT_CONFIDENCE;
    const blurThreshold = _config.PRESCREEN_BLUR_CONFIDENCE;
    const readable = result?.isReadable === true;
    const confidence = typeof result?.confidence === 'number' ? result.confidence : 0;
    const isBlurred = result?.isBlurred === true;
    const reason = result?.reason ?? 'Document quality issue';

    if (!readable || confidence < rejectThreshold) {
      this.obs.warn('DocumentPrescreen: rejected before full extraction', {
        documentType,
        fileIndex,
        confidence,
        reason,
        isBlurred,
      });
      throw new UnrecoverableDocumentError(
        'UNREADABLE_DOCUMENT',
        `${reason}. Please re-upload a clear, well-lit photo or scan.`,
      );
    }

    if (isBlurred || confidence < blurThreshold) {
      this.obs.warn('DocumentPrescreen: blurry/low-confidence — will extract with human review flag', {
        documentType,
        fileIndex,
        confidence,
        isBlurred,
        reason,
      });
      return { isBlurred, confidence, reason };
    }

    this.obs.info('DocumentPrescreen: passed', { documentType, fileIndex, confidence });
    return null;
  }
}
