
//  state map (shared with DL utils — same prefix logic)
const STATE_MAP: Record<string, string> = {
  AP: 'ANDHRA PRADESH',
  AR: 'ARUNACHAL PRADESH',
  AS: 'ASSAM',
  BR: 'BIHAR',
  CG: 'CHHATTISGARH',
  GA: 'GOA',
  GJ: 'GUJARAT',
  HR: 'HARYANA',
  HP: 'HIMACHAL PRADESH',
  JH: 'JHARKHAND',
  JK: 'JAMMU AND KASHMIR',
  KA: 'KARNATAKA',
  KL: 'KERALA',
  LA: 'LADAKH',
  LD: 'LAKSHADWEEP',
  MP: 'MADHYA PRADESH',
  MH: 'MAHARASHTRA',
  MN: 'MANIPUR',
  ML: 'MEGHALAYA',
  MZ: 'MIZORAM',
  NL: 'NAGALAND',
  OD: 'ODISHA',
  PB: 'PUNJAB',
  PY: 'PUDUCHERRY',
  RJ: 'RAJASTHAN',
  SK: 'SIKKIM',
  TN: 'TAMIL NADU',
  TS: 'TELANGANA',
  TR: 'TRIPURA',
  UP: 'UTTAR PRADESH',
  UK: 'UTTARAKHAND',
  WB: 'WEST BENGAL',
  AN: 'ANDAMAN AND NICOBAR ISLANDS',
  CH: 'CHANDIGARH',
  DN: 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
  DL: 'DELHI',
};

export interface RCStateHints {
  cardStateCode?: string | null;
  rtoCode?: string | null;
}

// normalize registration number
export function normalizeRegNo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/\s+/g, '').toUpperCase();
}

function stateCodeFromRto(rtoCode: string | null | undefined): string | null {
  if (!rtoCode) return null;
  const clean = rtoCode.replace(/\s+/g, '').toUpperCase();
  const match = clean.match(/^([A-Z]{2})/);
  if (match && STATE_MAP[match[1]]) return match[1];
  return null;
}

function isBharatSeriesRegNo(regNo: string): boolean {
  return /^\d{2}BH/i.test(regNo);
}

/** Resolve 2-letter state code — handles classic (JH02…) and Bharat series (23BH…) */
export function extractStateCode(
  regNo: string | null | undefined,
  hints: RCStateHints = {},
): string | null {
  const card = hints.cardStateCode?.trim().toUpperCase();
  if (card && STATE_MAP[card]) return card;

  const clean = normalizeRegNo(regNo);
  if (!clean || clean.length < 2) return null;

  const prefix2 = clean.substring(0, 2).toUpperCase();
  if (STATE_MAP[prefix2]) return prefix2;

  if (isBharatSeriesRegNo(clean)) {
    return stateCodeFromRto(hints.rtoCode);
  }

  return null;
}

export function detectStateFromRegNo(
  regNo: string | null | undefined,
  hints: RCStateHints = {},
): string | null {
  const code = extractStateCode(regNo, hints);
  return code ? STATE_MAP[code] ?? null : null;
}

// parse indian date strings → Date object
function parseIndianDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;

  const full = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (full) {
    const [, dd, mm, yyyy] = full;
    const d = new Date(`${yyyy}-${mm}-${dd}`);
    return isNaN(d.getTime()) ? null : d;
  }

  const monthYear = dateStr.match(/^(\d{2})\/(\d{4})$/);
  if (monthYear) {
    const [, mm, yyyy] = monthYear;
    const d = new Date(`${yyyy}-${mm}-01`);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

// compute rc status — skip non-date values like "As per Fitness"
export function computeRCStatus(regValidity: string | null | undefined): {
  isValid: boolean | null;
  isExpired: boolean | null;
  daysUntilExpiry: number | null;
} {
  const expiryDate = parseIndianDate(regValidity);

  if (!expiryDate) {
    return { isValid: null, isExpired: null, daysUntilExpiry: null };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffMs = expiryDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  return {
    isValid: diffDays >= 0,
    isExpired: diffDays < 0,
    daysUntilExpiry: diffDays,
  };
}

export function stripLeadingZeros(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const parsed = parseInt(raw, 10);
  return isNaN(parsed) ? null : parsed;
}

/** Split NEW/HPA + bank from purpose when financeBank / hypothecatedTo missing */
export function normaliseFinanceFields(data: {
  purpose?: string | null;
  financeBank?: string | null;
  hypothecatedTo?: string | null;
}): { purpose: string | null; financeBank: string | null; hypothecatedTo: string | null } {
  let purpose = data.purpose?.trim() ?? null;
  let financeBank = data.financeBank?.trim() ?? null;
  let hypothecatedTo = data.hypothecatedTo?.trim() ?? null;

  if (purpose && /HPA/i.test(purpose) && !financeBank) {
    const parts = purpose.split(/[/\s]+/).filter(Boolean);
    const bankPart = parts.find((p) => p.length > 3 && !/^(NEW|HPA|TO)$/i.test(p));
    if (bankPart) {
      financeBank = bankPart;
      if (!hypothecatedTo) hypothecatedTo = bankPart;
    }
  }

  if (hypothecatedTo && ['NA', 'N/A', 'NIL', '--'].includes(hypothecatedTo.toUpperCase())) {
    hypothecatedTo = null;
  }

  return { purpose, financeBank, hypothecatedTo };
}
