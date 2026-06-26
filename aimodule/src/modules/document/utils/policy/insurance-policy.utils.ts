


 // Normalise hypothecation value to null when it means "no loan".
 //Accepts: "--NA--", "NA", "N/A", "NIL", "Not Financed", "none", "null", "--"

export function normaliseHypothecation(val: string | null | undefined): string | null {
  if (!val) return null;
  const upper = val.trim().toUpperCase().replace(/-/g, '');
  if (['NA', 'N/A', 'NIL', 'NOT FINANCED', 'NONE', 'NULL', ''].includes(upper)) return null;
  return val.trim();
}


export function inferChannelType(
  agentCode: string | null | undefined,
  existing: string | null | undefined
): string {
  if (existing && existing !== 'null') return existing;
  if (!agentCode) return 'DIRECT';
  const code = agentCode.trim().toUpperCase();
  if (code.startsWith('AGI')) return 'AGENT';
  if (code.startsWith('BRC')) return 'BROKER';
  if (code.startsWith('TMIBASL') || code.startsWith('MSIBPL')) return 'BROKER';
  if (/^\d+$/.test(code)) return 'POSP';
  return 'DIRECT';
}

export function derivePolicyCoverage(policyType: string | null | undefined): string {
  if (!policyType) return 'PACKAGE';
  const t = policyType.toUpperCase();
  if (t.includes('TP') && t.includes('ONLY')) return 'TP_ONLY';
  if (t.includes('OD') && t.includes('ONLY')) return 'OD_ONLY';
  if (t.includes('BUNDLED')) return 'BUNDLED_1_3';
  if (t.includes('COMPREHENSIVE') || t.includes('PACKAGE')) return 'PACKAGE';
  return 'PACKAGE';
}

/** Map legacy period/IDV keys from older extractions into strict spec fields. */
export function normalizeStrictPolicyFields(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw };

  if (!out.policyStartDate && out.ownDamagePeriodFrom) {
    out.policyStartDate = out.ownDamagePeriodFrom;
  }
  if (!out.policyEndDate && out.ownDamagePeriodTo) {
    out.policyEndDate = out.ownDamagePeriodTo;
  }
  if (!out.policyStartDate && out.liabilityPeriodFrom) {
    out.policyStartDate = out.liabilityPeriodFrom;
  }
  if (!out.policyEndDate && out.liabilityPeriodTo) {
    out.policyEndDate = out.liabilityPeriodTo;
  }
  if (out.totalIdv == null && out.vehicleIdv != null) {
    out.totalIdv = out.vehicleIdv;
  }

  return out;
}

export function verifyPremiumMath(data: {
  totalPremium?: number | null;
  igstAmount?: number | null;
  cgstAmount?: number | null;
  sgstAmount?: number | null;
  stampDuty?: number | null;
  grossPremiumPaid?: number | null;
}): boolean {
  const base = data.totalPremium ?? 0;
  const tax =
    (data.igstAmount ?? 0) +
    (data.cgstAmount ?? 0) +
    (data.sgstAmount ?? 0);
  const duty = data.stampDuty ?? 0;
  const expected = base + tax + duty;
  const actual = data.grossPremiumPaid ?? 0;

  // If all values are zero, skip the check
  if (expected === 0 && actual === 0) return true;

  // Allow ±₹5 rounding tolerance
  return Math.abs(expected - actual) <= 5;
}
