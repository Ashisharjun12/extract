import { UnrecoverableDocumentError } from '../../../shared/errors/document.errors.js';
import { ObserverService } from '../../../infrastructure/observabllity/observer.service.js';

export interface DocumentGateFields {
  isCorrectDocumentType?: boolean;
  detectedDocumentType?: string | null;
  hasAllPagesCorrectType?: boolean;
  invalidPageIndices?: number[] | null;
  confidenceScore?: number;
}

export interface DocumentGateConfig {
  extractorName: string;
  wrongTypeMessage: (detectedType: string) => string;
  mixedBatchMessage: (pageList: string) => string;
}

export function isEffectivelyEmpty(val: unknown): boolean {
  return val == null || val === 'null' || val === '';
}

/** Shared type + mixed-page gates used by all four extractors (deduplicated). */
export function enforceDocumentTypeGates(parsed: DocumentGateFields, config: DocumentGateConfig): void {
  const obs = ObserverService.getInstance();
  const confidence = parsed.confidenceScore ?? 0;

  if (parsed.isCorrectDocumentType === false) {
    const typeStr = parsed.detectedDocumentType ?? 'an unrecognised document type';
    obs.warn(`${config.extractorName}: AI identified document as "${typeStr}" (confidence=${confidence}). Rejecting.`);
    throw new UnrecoverableDocumentError('WRONG_DOCUMENT_TYPE', config.wrongTypeMessage(typeStr));
  }

  if (parsed.hasAllPagesCorrectType === false) {
    const badPages = parsed.invalidPageIndices ?? [];
    const pageList =
      badPages.length > 0
        ? `Page(s) ${badPages.join(', ')} appear to be a different document type.`
        : 'At least one page is a different document type.';
    obs.warn(`${config.extractorName}: Mixed document batch detected. ${pageList} Rejecting.`);
    throw new UnrecoverableDocumentError('WRONG_DOCUMENT_TYPE', config.mixedBatchMessage(pageList));
  }
}

export function rejectWrongTypeOrUnreadable(
  extractorName: string,
  confidence: number,
  isWrongType: boolean,
  wrongTypeMessage: string,
  unreadableMessage: string,
): void {
  const obs = ObserverService.getInstance();
  if (isWrongType) {
    obs.warn(`${extractorName}: Document readable (confidence=${confidence}) but failed identity checks.`);
    throw new UnrecoverableDocumentError('WRONG_DOCUMENT_TYPE', wrongTypeMessage);
  }
  obs.warn(`${extractorName}: Document unreadable or blank (confidence=${confidence}).`);
  throw new UnrecoverableDocumentError('UNREADABLE_DOCUMENT', unreadableMessage);
}
