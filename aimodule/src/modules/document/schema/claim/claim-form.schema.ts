import { z } from 'zod';

const numericPreprocess = z.preprocess((val: unknown) => {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]+/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }
  return null;
}, z.number().nullable());

export const ClaimFormSchema = z.object({
  // Document Type Gate
  isCorrectDocumentType: z.boolean().optional(),
  detectedDocumentType: z.string().nullable().optional(),
  hasAllPagesCorrectType: z.boolean().optional(),
  invalidPageIndices: z.array(z.number()).nullable().optional(),

  // Spec fields
  claimNo:              z.string().nullable().optional(),
  dateOfLoss:           z.string().nullable().optional(),
  placeOfAccident:      z.string().nullable().optional(),
  natureOfLoss:         z.string().nullable().optional(),
  driverName:           z.string().nullable().optional(),
  policeReportNo:       z.string().nullable().optional(),
  witnessDetails:       z.string().nullable().optional(),
  descriptionOfDamage:  z.string().nullable().optional(),
  estimatedLoss:        numericPreprocess,

  // Review flags
  requiresHumanReview: z.boolean(),
  lowConfidenceFields: z.array(z.string()).nullish(),
  confidenceScore: z.number().catch(0),
});

export type IClaimFormSchema = z.infer<typeof ClaimFormSchema>;
