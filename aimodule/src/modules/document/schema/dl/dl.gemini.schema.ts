/**
 * Slim Gemini DL schema — only the fields required by platform spec.
 * Spec: Name, Address, DL Number, DOB, Issue Date, Expiry Date,
 *       Vehicle Class, Issuing RTO, Valid up to (Non-Transport).
 */
import { Type, Schema } from '@google/genai';

const str = (): Schema => ({ type: Type.STRING, nullable: true });

const vehicleClassItem: Schema = {
  type: Type.OBJECT,
  properties: {
    vehicleClass: str(),
    issuedOn: str(),
  },
};

export const DLGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    isCorrectDocumentType: { type: Type.BOOLEAN },
    detectedDocumentType: str(),
    hasAllPagesCorrectType: { type: Type.BOOLEAN },
    invalidPageIndices: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.NUMBER },
    },

    dlNumber:       str(),
    name:           str(),
    dob:            str(),
    address:        str(),
    issueDate:      str(),
    validityNT:     str(),
    issuingRto:     str(),

    vehicleClasses: {
      type: Type.ARRAY,
      nullable: true,
      items: vehicleClassItem,
    },

    requiresHumanReview: { type: Type.BOOLEAN },
    lowConfidenceFields: {
      type: Type.ARRAY,
      nullable: true,
      items: { type: Type.STRING },
    },
    confidenceScore: { type: Type.NUMBER },
  },
  required: [
    'isCorrectDocumentType',
    'detectedDocumentType',
    'hasAllPagesCorrectType',
    'requiresHumanReview',
    'confidenceScore',
  ],
};
