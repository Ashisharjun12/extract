/**
 * Slim Gemini RC schema — only the fields required by platform spec.
 * Spec: Owner Name, Registration No., Chassis No., Engine No., Make, Model,
 *       Fuel Type, Reg. Date, RC Expiry, Seating Capacity, Colour, Vehicle Class,
 *       RTO / Issuing Authority, Fitness Valid up to, Laden/unladen weight.
 */
import { Type, Schema } from '@google/genai';

const str = (): Schema => ({ type: Type.STRING, nullable: true });

export const RCGeminiSchema: Schema = {
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

    registrationNo:    str(),
    ownerName:         str(),
    chassisNo:         str(),
    engineNo:          str(),
    manufacturer:      str(),
    modelNo:           str(),
    fuel:              str(),
    registrationDate:  str(),
    regValidity:       str(),
    seatingCapacity:   str(),
    colour:            str(),
    vehicleClass:      str(),
    issuingAuthority:  str(),
    rtoCode:           str(),
    fitnessValidUpto:  str(),
    unladenWeight:     str(),
    ladenWeight:       str(),

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
