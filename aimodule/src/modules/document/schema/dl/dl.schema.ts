import { z } from 'zod';

const VehicleClassEntrySchema = z.object({
  vehicleClass: z.string().nullish(),
  issuedOn: z.string().nullish(),
});

export const DLSchema = z.object({
  // Document Type Gate
  isCorrectDocumentType: z.boolean().optional(),
  detectedDocumentType: z.string().nullable().optional(),
  hasAllPagesCorrectType: z.boolean().optional(),
  invalidPageIndices: z.array(z.number()).nullable().optional(),

  // Core fields per spec
  dlNumber:           z.string().nullish(),
  dlNumberNormalized: z.string().nullish(),
  state:              z.string().nullish(),
  name:       z.string().nullish(),
  dob:        z.string().nullish(),
  address:    z.string().nullish(),
  issueDate:  z.string().nullish(),
  validityNT: z.string().nullish(),
  issuingRto: z.string().nullish(),

  vehicleClasses: z.array(VehicleClassEntrySchema).nullish(),

  // Computed (derived post-extraction, not from AI)
  dlStatus: z.object({
    isNTValid: z.boolean().nullish(),
    isExpired: z.boolean().nullish(),
  }).nullish(),

  // Review flags
  requiresHumanReview: z.boolean(),
  lowConfidenceFields: z.array(z.string()).nullish(),
  confidenceScore: z.number().catch(0),
});

export type IDLSchema = z.infer<typeof DLSchema>;
