import { ZodError } from 'zod';
import { AIService } from '../../../infrastructure/ai/ai.service';
import { UnrecoverableDocumentError } from '../../../shared/errors/document.errors.js';
import { WorkshopBillSchema } from '../schema/workshop/workshop-bill.schema';
import {
  WorkshopBillGeminiSchema,
  WorkshopChunkGeminiSchema,
  WorkshopChunkArraySchema,
  WorkshopLeanGeminiSchema,
  WorkshopLeanArraySchema,
  WorkshopMetaGeminiSchema,
} from '../schema/workshop/workshop-bill.gemini.schema';
import {
  getWorkshopChunkPrompt,
  getWorkshopChunkArrayPrompt,
  getWorkshopLeanFirstChunkPrompt,
  getWorkshopLeanSinglePassPrompt,
  getWorkshopLeanArraySinglePassPrompt,
  getWorkshopLeanArrayFirstChunkPrompt,
  getWorkshopMetaPrompt,
  getWorkshopSinglePassPrompt,
} from '../prompts/workshop-bill.prompt';
import {
  normaliseGst,
  computeGrandTotalCheck,
  classifyBillType,
  extractVehicleState,
  normaliseVehicleNo,
  resolveSummaryPartsLabour,
  mergeWorkshopTableRows,
} from '../utils/workshop/workshop-bill.utils';
import {
  buildPageChunks,
  buildSliceInput,
  getPrimaryFileInput,
} from '../utils/workshop/workshop-pdf-slice.util.js';
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
import { computeWorkshopMaxTokens } from '../../../cost/token-budget.js';
import { resolveDocumentPageCount } from '../../../utils/document-page-count.util.js';
import {
  expandWorkshopShortKeys,
  expandWorkshopArrayRows,
  isArrayRowFormat,
  isWorkshopTruncationError,
} from '../schema/workshop/workshop-bill.shared.js';

type ExtractionMode = 'single-pass' | 'chunk-fallback';

type WorkshopRawResult = Record<string, unknown>;

type LeanChunkExtractResult = {
  raw: WorkshopRawResult;
  parts: Record<string, unknown>[];
  labour: Record<string, unknown>[];
};

export class WorkshopBillExtractor {
  private aiService: AIService;
  private obs = ObserverService.getInstance();

  constructor() {
    this.aiService = AIService.getInstance();
  }

  private parseWorkshopResult(raw: unknown) {
    try {
      const obj = raw as Record<string, unknown>;
      // Array-of-arrays format (lean mode) — expand positional arrays to named objects
      // before Zod validation; object format uses short-key expansion as before.
      const expanded = isArrayRowFormat(obj)
        ? expandWorkshopArrayRows(obj)
        : expandWorkshopShortKeys(obj);
      return WorkshopBillSchema.parse(expanded);
    } catch (e) {
      if (e instanceof ZodError) {
        this.obs.logError('WorkshopBillExtractor: Zod validation failed', {
          issueCount: e.issues.length,
          issues: e.issues.slice(0, 10).map(i => ({
            path: i.path.join('.'),
            code: i.code,
            message: i.message,
          })),
        });
        throw new UnrecoverableDocumentError(
          'EXTRACTION_SCHEMA_FAILED',
          'Workshop bill structure could not be validated. Re-upload a clearer PDF or a standard repair invoice.',
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
    model?: string,
  ) {
    return this.aiService.processDocument(
      inputData,
      prompt,
      schema,
      maxOutputTokens,
      model ?? _config.WORKSHOP_AI_MODEL,
      _config.WORKSHOP_MAX_GEMINI_RETRIES,
      cacheKey,
    );
  }

  private async extractSinglePass(inputData: unknown, pageCount: number): Promise<WorkshopRawResult> {
    const lean = _config.WORKSHOP_LEAN_MODE;
    const maxTokens = computeWorkshopMaxTokens(pageCount, _config.WORKSHOP_MAX_OUTPUT_TOKENS);

    this.obs.info(
      `WorkshopBillExtractor: Single-pass mode — ${pageCount} page(s), maxOutputTokens=${maxTokens}, lean=${lean}`,
    );

    // Lean mode: array-of-arrays output (~85% fewer tokens) on the chunk model
    const model = lean ? _config.WORKSHOP_CHUNK_AI_MODEL : undefined;
    return (await this.callGemini(
      inputData,
      lean ? getWorkshopLeanArraySinglePassPrompt() : getWorkshopSinglePassPrompt(),
      lean ? WorkshopLeanArraySchema : WorkshopBillGeminiSchema,
      maxTokens,
      'WORKSHOP',
      model,
    )) as WorkshopRawResult;
  }

  /** Local PDF slice per chunk — avoids billing full PDF input on every call. */
  private async extractChunkFallback(inputData: unknown, pageCount: number): Promise<WorkshopRawResult> {
    const chunkSize = _config.WORKSHOP_CHUNK_PAGE_SIZE;
    const chunks = buildPageChunks(pageCount, chunkSize);

    this.obs.info(
      `WorkshopBillExtractor: Chunk fallback — ${pageCount} page(s), ${chunks.length} slice(s), ` +
        `${chunkSize} pages/chunk (local PDF split)`,
    );

    const chunkModel = _config.WORKSHOP_CHUNK_AI_MODEL;
    const metaTokens = Math.min(
      16384,
      computeWorkshopMaxTokens(1, _config.WORKSHOP_MAX_OUTPUT_TOKENS),
    );
    const metaSlice = await buildSliceInput(inputData, [1], 'meta');

    this.obs.info(
      `WorkshopBillExtractor: Chunk fallback using model=${chunkModel} for meta+chunks`,
    );

    let meta: WorkshopRawResult;
    try {
      meta = (await this.callGemini(
        metaSlice.input,
        getWorkshopMetaPrompt(),
        WorkshopMetaGeminiSchema,
        metaTokens,
        'WORKSHOP-META',
        chunkModel,
      )) as WorkshopRawResult;
    } finally {
      await metaSlice.dispose();
    }

    enforceDocumentTypeGates(meta, {
      extractorName: 'WorkshopBillExtractor',
      wrongTypeMessage: (typeStr) =>
        `The uploaded document appears to be a "${typeStr}", not a Workshop Bill. ` +
        'Please upload a valid repair/service bill, proforma estimate, or job card.',
      mixedBatchMessage: (pageList) =>
        `Mixed document batch detected for Workshop Bill extraction. ${pageList} ` +
        'Please ensure all uploaded pages belong to the same workshop bill or repair estimate.',
    });

    const allParts: Record<string, unknown>[] = [];
    const allLabour: Record<string, unknown>[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const pageIndices = chunks[i];
      const pageStart = pageIndices[0];
      const pageEnd = pageIndices[pageIndices.length - 1];
      const chunkTokens = computeWorkshopMaxTokens(
        pageIndices.length,
        _config.WORKSHOP_MAX_OUTPUT_TOKENS,
      );

      this.obs.info(
        `WorkshopBillExtractor: Chunk ${i + 1}/${chunks.length} — pages ${pageStart}–${pageEnd}`,
      );

      const slice = await buildSliceInput(inputData, pageIndices, `chunk-${i + 1}`);
      try {
        const chunk = (await this.callGemini(
          slice.input,
          getWorkshopChunkPrompt(),
          WorkshopChunkGeminiSchema,
          chunkTokens,
          `WORKSHOP-CHUNK-${i + 1}`,
          chunkModel,
        )) as WorkshopRawResult;

        // Expand short keys immediately so mergeWorkshopTableRows dedup works on full field names.
        // Non-lean chunk fallback uses object format with short keys.
        const expanded = expandWorkshopShortKeys(chunk);
        if (Array.isArray(expanded.partsTable)) {
          allParts.push(...(expanded.partsTable as Record<string, unknown>[]));
        }
        if (Array.isArray(expanded.labourTable)) {
          allLabour.push(...(expanded.labourTable as Record<string, unknown>[]));
        }
      } finally {
        await slice.dispose();
      }
    }

    return {
      ...meta,
      partsTable: mergeWorkshopTableRows(allParts, 'totalPrice'),
      labourTable: mergeWorkshopTableRows(allLabour, 'totalAmount'),
    };
  }

  private countTableRows(raw: WorkshopRawResult): number {
    const parts = Array.isArray(raw.partsTable) ? raw.partsTable.length : 0;
    const labour = Array.isArray(raw.labourTable) ? raw.labourTable.length : 0;
    return parts + labour;
  }

  private appendExpandedRows(
    expanded: WorkshopRawResult,
    parts: Record<string, unknown>[],
    labour: Record<string, unknown>[],
  ): void {
    if (Array.isArray(expanded.partsTable)) {
      parts.push(...(expanded.partsTable as Record<string, unknown>[]));
    }
    if (Array.isArray(expanded.labourTable)) {
      labour.push(...(expanded.labourTable as Record<string, unknown>[]));
    }
  }

  /** Minimum rows expected for a chunk — first page often has letterhead + few rows. */
  private minRowsForChunk(
    pageIndices: number[],
    chunkIndex: number,
    totalPageCount: number,
  ): number {
    const pagesInChunk = pageIndices.length;
    const isFirstChunk = chunkIndex === 0 && pageIndices[0] === 1;
    const isLastChunk = pageIndices[pageIndices.length - 1] === totalPageCount;
    if (isFirstChunk) return 3 + (pagesInChunk - 1) * 8;
    if (isLastChunk) return Math.max(3, pagesInChunk * 5);
    return pagesInChunk * 8;
  }

  /** flash-lite can stop mid-chunk (~16 rows) without throwing — split and retry per page. */
  private isChunkSoftTruncated(
    rowCount: number,
    pageIndices: number[],
    chunkIndex: number,
    totalPageCount: number,
  ): boolean {
    if (rowCount === 0) return false;
    return rowCount < this.minRowsForChunk(pageIndices, chunkIndex, totalPageCount);
  }

  private hasSerialGapsForTable(rows: Record<string, unknown>[]): boolean {
    const serials: number[] = [];
    for (const row of rows) {
      const n = Number(row.srNo);
      if (Number.isFinite(n) && n > 0) {
        serials.push(n);
      }
    }
    if (serials.length <= 1) return false;

    const uniqueSerials = Array.from(new Set(serials)).sort((a, b) => a - b);
    const min = uniqueSerials[0];
    const max = uniqueSerials[uniqueSerials.length - 1];

    const expectedCount = max - min + 1;
    return expectedCount > uniqueSerials.length;
  }

  private hasSerialGaps(parts: Record<string, unknown>[], labour: Record<string, unknown>[]): boolean {
    return this.hasSerialGapsForTable(parts) || this.hasSerialGapsForTable(labour);
  }

  private maxSerialFromRows(rows: Record<string, unknown>[]): number {
    let max = 0;
    for (const row of rows) {
      const n = Number(row.srNo);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }

  /**
   * Lean + multi-page PDFs go straight to chunk mode — avoids a wasted single-pass call
   * that flash-lite silently truncates (~16–20 rows) before chunk retry doubles cost.
   */
  private shouldUseChunkDirect(pageCount: number, hasLocalPdf: boolean, fallbackEnabled: boolean): boolean {
    if (!fallbackEnabled || !hasLocalPdf) return false;
    if (_config.WORKSHOP_LEAN_MODE && pageCount >= 2) return true;
    return pageCount > _config.WORKSHOP_SINGLE_PASS_MAX_PAGES;
  }

  private async runSingleLeanChunkExtract(
    inputData: unknown,
    pageIndices: number[],
    isFirst: boolean,
    cacheSuffix: string,
    modelOverride?: string,
  ): Promise<LeanChunkExtractResult> {
    const chunkModel = modelOverride ?? _config.WORKSHOP_CHUNK_AI_MODEL;
    const chunkTokens = computeWorkshopMaxTokens(
      pageIndices.length,
      _config.WORKSHOP_MAX_OUTPUT_TOKENS,
    );

    const slice = await buildSliceInput(inputData, pageIndices, cacheSuffix);
    try {
      const chunk = (await this.callGemini(
        slice.input,
        isFirst
          ? getWorkshopLeanArrayFirstChunkPrompt()
          : getWorkshopChunkArrayPrompt(),
        isFirst ? WorkshopLeanArraySchema : WorkshopChunkArraySchema,
        chunkTokens,
        cacheSuffix,
        chunkModel,
      )) as WorkshopRawResult;

      const expanded = expandWorkshopArrayRows(chunk);
      const parts: Record<string, unknown>[] = [];
      const labour: Record<string, unknown>[] = [];
      this.appendExpandedRows(expanded, parts, labour);

      return { raw: chunk, parts, labour };
    } finally {
      await slice.dispose();
    }
  }

  /**
   * Extract one chunk; if flash-lite stops early, retry each page in the chunk separately.
   * Only splits when multi-page chunk looks truncated — keeps cost low for normal bills.
   */
  private async extractLeanChunkResilient(
    inputData: unknown,
    pageIndices: number[],
    chunkIndex: number,
    totalPageCount: number,
    isFirst: boolean,
  ): Promise<LeanChunkExtractResult> {
    const pageStart = pageIndices[0];
    const pageEnd = pageIndices[pageIndices.length - 1];

    this.obs.info(
      `WorkshopBillExtractor: Lean chunk ${chunkIndex + 1} — pages ${pageStart}–${pageEnd}`,
    );

    let initial = await this.runSingleLeanChunkExtract(
      inputData,
      pageIndices,
      isFirst,
      `WORKSHOP-LEAN-CHUNK-${chunkIndex + 1}`,
    );
    let initialRows = initial.parts.length + initial.labour.length;

    let isTruncated = this.isChunkSoftTruncated(initialRows, pageIndices, chunkIndex, totalPageCount);
    if (!isTruncated && this.hasSerialGaps(initial.parts, initial.labour)) {
      this.obs.warn(
        `WorkshopBillExtractor: Gap in serial numbers detected on initial chunk ${chunkIndex + 1}. Marking as truncated.`,
        { parts: initial.parts.length, labour: initial.labour.length }
      );
      isTruncated = true;
    }

    if (!isTruncated) {
      return initial;
    }

    // Single-page chunk truncation fallback: retry with the Pro model (WORKSHOP_AI_MODEL)
    if (pageIndices.length <= 1) {
      const proModel = _config.WORKSHOP_AI_MODEL;
      if (proModel && proModel !== _config.WORKSHOP_CHUNK_AI_MODEL) {
        this.obs.warn(
          `WorkshopBillExtractor: Single-page chunk ${chunkIndex + 1} (page ${pageStart}) is truncated or has gaps. Retrying with Pro model (${proModel}).`,
          { rowCount: initialRows }
        );
        try {
          const proResult = await this.runSingleLeanChunkExtract(
            inputData,
            pageIndices,
            isFirst,
            `WORKSHOP-LEAN-CHUNK-${chunkIndex + 1}-PRO`,
            proModel,
          );
          const proRows = proResult.parts.length + proResult.labour.length;
          if (proRows > initialRows) {
            this.obs.info(
              `WorkshopBillExtractor: Pro model extraction successful — rows increased from ${initialRows} to ${proRows}.`,
            );
            return proResult;
          }
        } catch (e) {
          this.obs.warn(`WorkshopBillExtractor: Pro model fallback failed for page ${pageStart}, using initial Lite results`, { error: e });
        }
      }
      return initial;
    }

    this.obs.warn(
      `WorkshopBillExtractor: Chunk ${chunkIndex + 1} soft-truncated (${initialRows} rows for ` +
        `pages ${pageStart}–${pageEnd}) — retrying page-by-page.`,
      { pageIndices, initialRows },
    );

    const mergedParts: Record<string, unknown>[] = [];
    const mergedLabour: Record<string, unknown>[] = [];
    let gateRaw = initial.raw;

    for (let p = 0; p < pageIndices.length; p++) {
      const singlePage = [pageIndices[p]];
      const pageIsFirst = isFirst && p === 0;
      let sub = await this.runSingleLeanChunkExtract(
        inputData,
        singlePage,
        pageIsFirst,
        `WORKSHOP-LEAN-CHUNK-${chunkIndex + 1}P${pageIndices[p]}`,
      );

      // If a single page run has serial number gaps or output truncation zones (e.g. >= 15 rows),
      // we retry it with the Pro model.
      const subRows = sub.parts.length + sub.labour.length;
      if (this.hasSerialGaps(sub.parts, sub.labour) || subRows >= 15) {
        const proModel = _config.WORKSHOP_AI_MODEL;
        if (proModel && proModel !== _config.WORKSHOP_CHUNK_AI_MODEL) {
          this.obs.warn(
            `WorkshopBillExtractor: Single-page run for page ${pageIndices[p]} appears truncated/long (${subRows} rows). Retrying page with Pro model (${proModel}).`,
          );
          try {
            const proSub = await this.runSingleLeanChunkExtract(
              inputData,
              singlePage,
              pageIsFirst,
              `WORKSHOP-LEAN-CHUNK-${chunkIndex + 1}P${pageIndices[p]}-PRO`,
              proModel,
            );
            const proRows = proSub.parts.length + proSub.labour.length;
            if (proRows > subRows) {
              this.obs.info(
                `WorkshopBillExtractor: Page ${pageIndices[p]} Pro model extraction successful — rows increased from ${subRows} to ${proRows}.`,
              );
              sub = proSub;
            }
          } catch (e) {
            this.obs.warn(`WorkshopBillExtractor: Page ${pageIndices[p]} Pro model fallback failed`, { error: e });
          }
        }
      }

      if (pageIsFirst) gateRaw = sub.raw;
      mergedParts.push(...sub.parts);
      mergedLabour.push(...sub.labour);
    }

    return { raw: gateRaw, parts: mergedParts, labour: mergedLabour };
  }

  /**
   * Lean chunk fallback — skips separate meta pass.
   * First chunk includes gate check; subsequent chunks extract tables only.
   * Saves 1 Gemini API call vs full chunk fallback.
   */
  private async extractChunkFallbackLean(inputData: unknown, pageCount: number): Promise<WorkshopRawResult> {
    const chunkSize = _config.WORKSHOP_CHUNK_PAGE_SIZE;
    const chunks = buildPageChunks(pageCount, chunkSize);

    this.obs.info(
      `WorkshopBillExtractor: Lean chunk mode — ${pageCount} page(s), ${chunks.length} slice(s), ` +
        `${chunkSize} pages/chunk, model=${_config.WORKSHOP_CHUNK_AI_MODEL}`,
    );

    const allParts: Record<string, unknown>[] = [];
    const allLabour: Record<string, unknown>[] = [];
    let gateResult: WorkshopRawResult | undefined;

    for (let i = 0; i < chunks.length; i++) {
      const pageIndices = chunks[i];
      const isFirst = i === 0;

      const result = await this.extractLeanChunkResilient(
        inputData,
        pageIndices,
        i,
        pageCount,
        isFirst,
      );

      if (isFirst) {
        gateResult = result.raw;
        enforceDocumentTypeGates(result.raw, {
          extractorName: 'WorkshopBillExtractor',
          wrongTypeMessage: (typeStr) =>
            `The uploaded document appears to be a "${typeStr}", not a Workshop Bill. ` +
            'Please upload a valid repair/service bill, proforma estimate, or job card.',
          mixedBatchMessage: (pageList) =>
            `Mixed document batch detected for Workshop Bill extraction. ${pageList} ` +
            'Please ensure all uploaded pages belong to the same workshop bill or repair estimate.',
        });
      }

      allParts.push(...result.parts);
      allLabour.push(...result.labour);
    }

    const mergedParts = mergeWorkshopTableRows(allParts, 'totalPrice');
    const mergedLabour = mergeWorkshopTableRows(allLabour, 'totalAmount');

    const maxSr = Math.max(
      this.maxSerialFromRows(mergedParts),
      this.maxSerialFromRows(mergedLabour),
    );
    const totalRows = mergedParts.length + mergedLabour.length;
    if (maxSr > 0 && maxSr > totalRows + 2) {
      this.obs.warn(
        `WorkshopBillExtractor: Sr.No gap after merge — maxSr=${maxSr}, rows=${totalRows}. ` +
          'Some table rows may be missing; flagging for human review.',
        { maxSr, totalRows, pageCount },
      );
      if (gateResult) {
        gateResult = {
          ...gateResult,
          requiresHumanReview: true,
          confidenceScore: Math.min(Number(gateResult.confidenceScore ?? 1), 0.75),
        };
      }
    }

    return {
      ...(gateResult ?? {}),
      partsTable: mergedParts,
      labourTable: mergedLabour,
    };
  }

  /**
   * Returns true when a single-pass result looks silently truncated.
   * flash-lite can stop at ~20 rows with finishReason=STOP and no error thrown.
   * Heuristic: fewer than 10 rows per page on a multi-page bill is suspicious.
   */
  private isSoftTruncated(raw: WorkshopRawResult, pageCount: number): boolean {
    if (pageCount < 2) return false;
    const totalRows = this.countTableRows(raw);
    const minExpected = pageCount * 10;
    return totalRows < minExpected;
  }

  private async extractWithFallback(
    inputData: unknown,
    pageCount: number,
  ): Promise<{ raw: WorkshopRawResult; mode: ExtractionMode }> {
    const fallbackEnabled = _config.WORKSHOP_CHUNK_FALLBACK_ENABLED === 'true';
    const hasLocalPdf = Boolean(getPrimaryFileInput(inputData)?.localPdfPath);
    const maxSinglePassPages = _config.WORKSHOP_SINGLE_PASS_MAX_PAGES;

    // Lean multi-page + large bills skip single-pass — flash-lite silently stops at ~16–20 rows.
    if (this.shouldUseChunkDirect(pageCount, hasLocalPdf, fallbackEnabled)) {
      this.obs.info(
        `WorkshopBillExtractor: Skipping single-pass — ${pageCount} page(s), ` +
          `lean=${_config.WORKSHOP_LEAN_MODE}, maxSinglePass=${maxSinglePassPages}. ` +
          'Running chunk mode directly.',
      );
      const raw = _config.WORKSHOP_LEAN_MODE
        ? await this.extractChunkFallbackLean(inputData, pageCount)
        : await this.extractChunkFallback(inputData, pageCount);
      return { raw, mode: 'chunk-fallback' };
    }

    try {
      const raw = await this.extractSinglePass(inputData, pageCount);

      // Fix C: soft-truncation safety net — flash-lite can return too few rows with no error.
      if (this.isSoftTruncated(raw, pageCount) && fallbackEnabled && hasLocalPdf) {
        this.obs.warn(
          `WorkshopBillExtractor: Soft truncation detected on single-pass ` +
            `(${(Array.isArray(raw.partsTable) ? (raw.partsTable as unknown[]).length : 0) + (Array.isArray(raw.labourTable) ? (raw.labourTable as unknown[]).length : 0)} rows for ${pageCount} pages) — ` +
            `retrying with chunk fallback.`,
          { pageCount, chunkSize: _config.WORKSHOP_CHUNK_PAGE_SIZE },
        );
        const retried = _config.WORKSHOP_LEAN_MODE
          ? await this.extractChunkFallbackLean(inputData, pageCount)
          : await this.extractChunkFallback(inputData, pageCount);
        return { raw: retried, mode: 'chunk-fallback' };
      }

      return { raw, mode: 'single-pass' };
    } catch (err) {
      if (!isWorkshopTruncationError(err)) throw err;

      if (!fallbackEnabled || !hasLocalPdf) {
        throw new UnrecoverableDocumentError(
          'EXTRACTION_TRUNCATED',
          fallbackEnabled
            ? 'Workshop bill output exceeded token limit. PDF page slicing is unavailable for this upload — use a PDF file URL or split the document manually.'
            : 'Workshop bill output exceeded token limit in single-pass mode. Enable WORKSHOP_CHUNK_FALLBACK_ENABLED or split the PDF into smaller uploads.',
        );
      }

      this.obs.warn(
        'WorkshopBillExtractor: Single-pass truncated — running local PDF chunk fallback',
        { pageCount, chunkSize: _config.WORKSHOP_CHUNK_PAGE_SIZE, lean: _config.WORKSHOP_LEAN_MODE },
      );

      const raw = _config.WORKSHOP_LEAN_MODE
        ? await this.extractChunkFallbackLean(inputData, pageCount)
        : await this.extractChunkFallback(inputData, pageCount);
      return { raw, mode: 'chunk-fallback' };
    }
  }

  public async extract(inputData: unknown) {
    const fileCount = Array.isArray(inputData) ? inputData.length : 1;
    const pageCount = resolveDocumentPageCount(inputData);

    this.obs.info(
      `WorkshopBillExtractor: Starting extraction — ${fileCount} file(s), ${pageCount} PDF page(s), ` +
        `lean=${_config.WORKSHOP_LEAN_MODE}, chunkFallback=${_config.WORKSHOP_CHUNK_FALLBACK_ENABLED}`,
    );

    const { raw: rawResult, mode: extractionMode } = await this.extractWithFallback(
      inputData,
      pageCount,
    );

    this.obs.info('WorkshopBillExtractor: Raw extraction complete, validating with Zod schema...');

    const parsedResult = this.parseWorkshopResult(rawResult);

    if (extractionMode === 'single-pass') {
      enforceDocumentTypeGates(parsedResult, {
        extractorName: 'WorkshopBillExtractor',
        wrongTypeMessage: (typeStr) =>
          `The uploaded document appears to be a "${typeStr}", not a Workshop Bill. ` +
          'Please upload a valid repair/service bill, proforma estimate, or job card.',
        mixedBatchMessage: (pageList) =>
          `Mixed document batch detected for Workshop Bill extraction. ${pageList} ` +
          'Please ensure all uploaded pages belong to the same workshop bill or repair estimate. ' +
          'Remove any RC cards, DLs, insurance policies, or sale invoices from the upload.',
      });
    }

    const confidence = parsedResult.confidenceScore ?? 0;
    const hasPartsOrLabour =
      (parsedResult.partsTable?.length ?? 0) > 0 ||
      (parsedResult.labourTable?.length ?? 0) > 0;

    const hasWorkshopIdentity =
      !isEffectivelyEmpty(parsedResult.workshopDetails?.name) ||
      !isEffectivelyEmpty(parsedResult.workshopDetails?.invoiceNumber);

    if (!hasPartsOrLabour && !hasWorkshopIdentity) {
      rejectWrongTypeOrUnreadable(
        'WorkshopBillExtractor',
        confidence,
        confidence >= 0.3,
        'The uploaded document does not appear to be a Workshop Bill or Invoice. ' +
          'A valid workshop bill must contain repair parts, labour charges, or at minimum a workshop name and invoice number. ' +
          'Supported formats: Workshop Estimate, Proforma Invoice, Job Card, or Final Invoice (PDF/image).',
        'The uploaded document could not be read. ' +
          'Please ensure the image is clear and shows the full workshop bill. ' +
          'Re-upload a higher quality scan or photo.',
      );
    }

    const summary = parsedResult.summary;
    const gstInfo = normaliseGst({
      igstRate: summary?.igstRate,
      igstAmount: summary?.igstAmount,
      cgstRate: summary?.cgstRate,
      cgstAmount: summary?.cgstAmount,
      sgstRate: summary?.sgstRate,
      sgstAmount: summary?.sgstAmount,
    });

    const { parts, labour, taxInclusive } = resolveSummaryPartsLabour(summary);

    const grandTotalCheck = computeGrandTotalCheck({
      partsTotal: parts,
      labourTotal: labour,
      totalTaxAmount: gstInfo.totalTaxAmount,
      totalGstAmount: summary?.totalGstAmount,
      grandTotal: summary?.grandTotal,
      discountAmount: summary?.totalDiscount,
      taxInclusiveSubtotals: taxInclusive,
    });

    if (!grandTotalCheck.ok) {
      this.obs.warn(
        `WorkshopBillExtractor: Grand total mismatch — ` +
          `expected=₹${grandTotalCheck.expected.toFixed(2)}, ` +
          `actual=₹${grandTotalCheck.actual.toFixed(2)}, ` +
          `delta=₹${grandTotalCheck.delta.toFixed(2)}. Flagging for human review.`,
      );
    }

    const billType = classifyBillType(
      parsedResult.workshopDetails?.invoiceNumber,
      parsedResult.workshopDetails?.documentTitle,
    );

    const rawVehicle = parsedResult.workshopDetails?.vehicleNumber ?? null;
    const normVehicleNo = normaliseVehicleNo(rawVehicle);
    const vehicleState = extractVehicleState(normVehicleNo);

    const enriched = {
      ...parsedResult,
      vehicleNumber: normVehicleNo ?? rawVehicle,
      vehicleState,
      billType,
      gstSummary: gstInfo,
      grandTotalVerified: grandTotalCheck.ok,
      requiresHumanReview: parsedResult.requiresHumanReview || !grandTotalCheck.ok,
      extractionMode,
    };

    this.obs.info(
      `WorkshopBillExtractor: Extraction successful — ` +
        `pages=${pageCount}, mode=${extractionMode}, ` +
        `parts=${parsedResult.partsTable?.length ?? 0}, ` +
        `labour=${parsedResult.labourTable?.length ?? 0}, ` +
        `billType=${billType}, ` +
        `gst=${gstInfo.type}(${gstInfo.rate}%), ` +
        `grandTotalOk=${grandTotalCheck.ok}, ` +
        `vehicleState=${vehicleState ?? 'N/A'}`,
    );

    return mergeDocumentQuality(
      enriched,
      getQualityHintFromInput(inputData),
      _config.PRESCREEN_BLUR_CONFIDENCE,
    );
  }
}
