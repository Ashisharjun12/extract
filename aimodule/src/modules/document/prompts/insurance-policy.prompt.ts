// insurance-policy.prompt.ts — strict spec fields only (cost-optimised)

const POLICY_GATE_RULES = `
  GATE (do first):
  • isCorrectDocumentType = true only for motor insurance policy / certificate / cover note.
  • false for workshop bill, RC, DL, sale invoice.
  • hasAllPagesCorrectType = true if all pages are the same policy.
  If false, STOP — return nulls.
`;

const STRICT_FIELD_LIST = `
  EXTRACT ONLY these flat fields (null if not visible — NO other keys):
  policyNumber, insurerName, insuredName, insuredAddress, registrationNo,
  policyType (OD / TP / Comprehensive / Package / Bundled),
  totalIdv (sum insured / IDV — NOT premium),
  policyStartDate, policyEndDate (from Own Damage or overall policy period),
  ncbPercentage, grossPremiumPaid (final payable — NOT IDV),
  engineNo, chassisNo, nomineeName, registrationAuthority (RTO / zone),
  addOnCovers[] { name, opted } — checkbox add-on table only, skip if absent.
  Gate + quality: isCorrectDocumentType, detectedDocumentType, hasAllPagesCorrectType,
  invalidPageIndices, confidenceScore, requiresHumanReview.
`;

const PREMIUM_RULE = `
  grossPremiumPaid = "Gross Premium Paid" / "Premium Paid" on Schedule of Premium.
  totalIdv = vehicle IDV (often ₹2L–₹25L). NEVER swap IDV and premium.
`;

export const getInsurancePolicySinglePassPrompt = (): string => `
  Indian motor insurance OCR — STRICT SPEC ONLY.

  ${POLICY_GATE_RULES}

  ${STRICT_FIELD_LIST}

  ${PREMIUM_RULE}

  SKIP page 3+ legal clauses (LIMITATIONS, DRIVER'S CLAUSE, NCB text). Use pages 1–2 only.
  Output flat JSON only. No markdown. Numbers without ₹ or commas.
`;

/** @deprecated Multipass disabled — same prompt as single-pass */
export const getInsurancePolicyGatePrompt = getInsurancePolicySinglePassPrompt;
export const getInsurancePolicyDataPrompt = getInsurancePolicySinglePassPrompt;
export const getInsurancePolicyPremiumPrompt = getInsurancePolicySinglePassPrompt;
