/** Nested Gemini groups → flat Zod field names */
const POLICY_NESTED_GROUPS = [
  'policyIdentity',
  'insurer',
  'insured',
  'periods',
  'vehicle',
  'idv',
  'deductibles',
  'previousPolicy',
  'nominee',
  'hypothecation',
  'intermediary',
  'odPremium',
  'tpPremium',
  'tax',
  'payment',
] as const;

const PAGE_MAP_KEYS = ['dataPageIndices', 'premiumPageIndices', 'skipPageIndices'] as const;

function flattenOne(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  for (const group of POLICY_NESTED_GROUPS) {
    const block = out[group];
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      Object.assign(out, block as Record<string, unknown>);
      delete out[group];
    }
  }
  return out;
}

export function stripPolicyPageMap(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };
  for (const key of PAGE_MAP_KEYS) {
    delete out[key];
  }
  return out;
}

export function mergePolicyPasses(...passes: Record<string, unknown>[]): Record<string, unknown> {
  let merged: Record<string, unknown> = {};
  for (const pass of passes) {
    merged = { ...merged, ...flattenOne(pass) };
  }
  return merged;
}

export function mergePolicyConfidence(
  ...passes: Array<{ confidenceScore?: number; requiresHumanReview?: boolean; lowConfidenceFields?: string[] | null }>
): {
  confidenceScore: number;
  requiresHumanReview: boolean;
  lowConfidenceFields: string[] | null;
} {
  const scores = passes.map((p) => p.confidenceScore).filter((s): s is number => typeof s === 'number');
  const confidenceScore = scores.length > 0 ? Math.min(...scores) : 0;
  const requiresHumanReview = passes.some((p) => Boolean(p.requiresHumanReview));
  const lowConfidenceFields = [
    ...new Set(
      passes.flatMap((p) => (Array.isArray(p.lowConfidenceFields) ? p.lowConfidenceFields : [])),
    ),
  ];
  return {
    confidenceScore,
    requiresHumanReview,
    lowConfidenceFields: lowConfidenceFields.length > 0 ? lowConfidenceFields : null,
  };
}
