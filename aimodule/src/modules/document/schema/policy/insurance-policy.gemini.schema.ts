/**
 * Strict Gemini schema — spec fields only (no premium line-item arrays).
 * Keeps output small for flash-lite single-pass (~₹0.5–₹1 per policy).
 */
import { Schema, Type } from '@google/genai';

const str = (): Schema => ({ type: Type.STRING, nullable: true });
const num = (): Schema => ({ type: Type.NUMBER, nullable: true });

const addOnCoverItem: Schema = {
  type: Type.OBJECT,
  properties: {
    name: str(),
    opted: { type: Type.BOOLEAN, nullable: true },
  },
};

const documentGateProps: Record<string, Schema> = {
  isCorrectDocumentType: { type: Type.BOOLEAN },
  detectedDocumentType: str(),
  hasAllPagesCorrectType: { type: Type.BOOLEAN },
  invalidPageIndices: {
    type: Type.ARRAY,
    nullable: true,
    items: { type: Type.NUMBER },
  },
  confidenceScore: { type: Type.NUMBER },
  requiresHumanReview: { type: Type.BOOLEAN },
};

const gateRequired = [
  'isCorrectDocumentType',
  'detectedDocumentType',
  'hasAllPagesCorrectType',
  'confidenceScore',
  'requiresHumanReview',
];

/** Strict spec — matches product field list only */
const strictSpecFields: Record<string, Schema> = {
  policyNumber: str(),
  insurerName: str(),
  insuredName: str(),
  insuredAddress: str(),
  registrationNo: str(),
  policyType: str(),
  totalIdv: num(),
  policyStartDate: str(),
  policyEndDate: str(),
  ncbPercentage: num(),
  grossPremiumPaid: num(),
  engineNo: str(),
  chassisNo: str(),
  nomineeName: str(),
  registrationAuthority: str(),
};

export const PolicySinglePassGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    ...documentGateProps,
    ...strictSpecFields,
    addOnCovers: { type: Type.ARRAY, nullable: true, items: addOnCoverItem },
  },
  required: gateRequired,
};

/** @deprecated Multipass disabled — kept for type compatibility */
export const PolicyGateGeminiSchema = PolicySinglePassGeminiSchema;
export const PolicyDataGeminiSchema = PolicySinglePassGeminiSchema;
export const PolicyPremiumGeminiSchema = PolicySinglePassGeminiSchema;
export const InsurancePolicyGeminiSchema = PolicySinglePassGeminiSchema;
export const PolicyMetaGeminiSchema = PolicySinglePassGeminiSchema;
