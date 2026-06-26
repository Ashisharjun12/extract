/**
 * Gemini schema for Claim Form extraction.
 * Spec: Claim No., Date of Loss, Place of Accident, Nature of Loss,
 *       Driver Name, Police Report No., Witness Details,
 *       Description of Damage, Estimated Loss.
 */
import { Schema, Type } from '@google/genai';

const str = (): Schema => ({ type: Type.STRING, nullable: true });

export const ClaimFormGeminiSchema: Schema = {
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

    claimNo:             str(),
    dateOfLoss:          str(),
    placeOfAccident:     str(),
    natureOfLoss:        str(),
    driverName:          str(),
    policeReportNo:      str(),
    witnessDetails:      str(),
    descriptionOfDamage: str(),
    estimatedLoss:       { type: Type.NUMBER, nullable: true },

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
