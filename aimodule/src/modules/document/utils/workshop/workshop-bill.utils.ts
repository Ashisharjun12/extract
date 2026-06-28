//  State Map
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

//normalize gst
export function normaliseGst(data: {
  igstRate?: number | null;
  igstAmount?: number | null;
  cgstRate?: number | null;
  cgstAmount?: number | null;
  sgstRate?: number | null;
  sgstAmount?: number | null;
}): {
  type: 'IGST' | 'CGST_SGST' | 'NONE';
  rate: number;
  totalTaxAmount: number;
} {
  const igst = data.igstAmount ?? 0;
  const cgst = data.cgstAmount ?? 0;
  const sgst = data.sgstAmount ?? 0;

  if (igst > 0) {
    return {
      type: 'IGST',
      rate: data.igstRate ?? 18,
      totalTaxAmount: igst,
    };
  }

  if (cgst > 0 || sgst > 0) {
    return {
      type: 'CGST_SGST',
      rate: (data.cgstRate ?? 0) + (data.sgstRate ?? 0),
      totalTaxAmount: cgst + sgst,
    };
  }

  return { type: 'NONE', rate: 0, totalTaxAmount: 0 };
}

type SummaryLike = {
  totalPartsAmount?: number | null;
  totalLabourAmount?: number | null;
  partsSubtotalWithTax?: number | null;
  labourSubtotalWithTax?: number | null;
  totalGstAmount?: number | null;
  grandTotal?: number | null;
  totalDiscount?: number | null;
};

/** Resolve parts/labour totals from summary — supports tax-inclusive subtotals (Eicher-style) */
export function resolveSummaryPartsLabour(summary: SummaryLike | null | undefined): {
  parts: number;
  labour: number;
  taxInclusive: boolean;
} {
  if (!summary) return { parts: 0, labour: 0, taxInclusive: false };

  const partsWithTax = summary.partsSubtotalWithTax ?? 0;
  const labourWithTax = summary.labourSubtotalWithTax ?? 0;
  if (partsWithTax > 0 || labourWithTax > 0) {
    return { parts: partsWithTax, labour: labourWithTax, taxInclusive: true };
  }

  return {
    parts: summary.totalPartsAmount ?? 0,
    labour: summary.totalLabourAmount ?? 0,
    taxInclusive: false,
  };
}

//compute grand total check
export function computeGrandTotalCheck(data: {
  partsTotal?: number | null;
  labourTotal?: number | null;
  totalTaxAmount: number;
  totalGstAmount?: number | null;
  grandTotal?: number | null;
  discountAmount?: number | null;
  taxInclusiveSubtotals?: boolean;
}): { ok: boolean; expected: number; actual: number; delta: number } {
  const parts = data.partsTotal ?? 0;
  const labour = data.labourTotal ?? 0;
  const tax = data.totalTaxAmount ?? 0;
  const combinedGst = data.totalGstAmount ?? 0;
  const discount = data.discountAmount ?? 0;

  let expected: number;
  if (data.taxInclusiveSubtotals) {
    expected = parts + labour - discount;
  } else if (combinedGst > 0) {
    expected = parts + labour + combinedGst - discount;
  } else {
    expected = parts + labour + tax - discount;
  }

  const actual = data.grandTotal ?? 0;
  const delta = Math.abs(expected - actual);

  return { ok: delta <= 10, expected, actual, delta };
}


export function classifyBillType(
  invoiceNumber: string | null | undefined,
  documentTitle: string | null | undefined
): 'ESTIMATE' | 'PROFORMA' | 'FINAL_INVOICE' | 'UNKNOWN' {
  const checkIn = (s: string | null | undefined) => s?.toUpperCase() ?? '';

  const inv   = checkIn(invoiceNumber);
  const title = checkIn(documentTitle);

  if (inv.startsWith('EST') || title.includes('ESTIMATE')) return 'ESTIMATE';
  if (inv.startsWith('PRO') || inv.startsWith('PF') || title.includes('PROFORMA') || title.includes('PERFORMA')) return 'PROFORMA';
  if (inv.startsWith('INV') || inv.startsWith('TAX') || /^\d+$/.test(inv)) return 'FINAL_INVOICE';

  // Fall back to title keywords
  if (title.includes('FINAL') || title.includes('INVOICE') || title.includes('BILL')) return 'FINAL_INVOICE';

  return 'UNKNOWN';
}

//extract vehicle state
export function extractVehicleState(vehicleNumber: string | null | undefined): string | null {
  const clean = normaliseVehicleNo(vehicleNumber);
  if (!clean || clean.length < 2) return null;
  const prefix = clean.substring(0, 2).toUpperCase();
  return STATE_MAP[prefix] ?? null;
}

//normalise vehicle registration number
//eg: "jh 11 ad 0786" -> "JH11AD0786"
//eg: "jh-11-ad-0786" -> "JH11AD0786"
export function normaliseVehicleNo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.replace(/[\s.\-]+/g, '').toUpperCase();
}

type TableRow = Record<string, unknown>;

function rowDedupeKey(row: TableRow, amountKey: string): string {
  const srNo = String(row.srNo ?? '').trim();
  const code = String(row.partNumber ?? row.labourCode ?? '').trim();
  const desc = String(row.description ?? '').trim().toLowerCase();
  const amount = row[amountKey];
  return `${srNo}|${code}|${desc}|${amount}`;
}

/** Merge chunk pass rows and drop obvious duplicates from repeated page headers. */
export function mergeWorkshopTableRows<T extends TableRow>(
  rows: T[],
  amountKey: 'totalPrice' | 'totalAmount',
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = rowDedupeKey(row, amountKey);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}


/**
 * Returns true if all rows in the merged table already have valid, strictly-increasing
 * serial numbers (i.e. the PDF printed them and they survived chunking intact).
 * In that case we must NOT touch them — the PDF numbers are canonical.
 */
function serialsAreAlreadyContinuous(rows: TableRow[], startSrNo: number): boolean {
  if (rows.length === 0) return true;
  let prev = startSrNo; // the serial number that preceded the first row
  for (const row of rows) {
    const n = Number(row.srNo);
    if (!Number.isFinite(n) || n <= 0) return false; // missing serial
    if (n <= prev) return false;                     // restart or duplicate
    prev = n;
  }
  return true;
}

export function resequenceTableSerials<T extends TableRow>(
  rows: T[],
  startSrNo = 0,
): T[] {
  if (rows.length === 0) return rows;

  // Determine whether any row has a valid (positive integer) serial number.
  const hasAnySerial = rows.some((r) => {
    const n = Number(r.srNo);
    return Number.isFinite(n) && n > 0;
  });

  if (!hasAnySerial) {
    // No serials at all — generate 1..N from startSrNo.
    rows.forEach((row, idx) => {
      (row as Record<string, unknown>).srNo = startSrNo + idx + 1;
    });
    return rows;
  }

  // ── NEW ────────────────────────────────────────────────────────────────────
  // If the PDF already printed continuous, monotonically-increasing serials that
  // carried through chunking without restarting, leave them completely intact.
  // Applying an offset would double-count the startSrNo and corrupt the numbers.
  if (serialsAreAlreadyContinuous(rows, startSrNo)) {
    return rows;
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Serials exist but restart per chunk. Walk through and apply an offset
  // each time we detect a restart (current original ≤ previous original).
  let offset = startSrNo;     // cumulative offset to add to the original serial
  let prevOriginal = 0;       // last seen original serial value from the AI
  let counter = startSrNo;   // fallback counter for null/0 rows

  for (const row of rows) {
    const orig = Number(row.srNo);
    const valid = Number.isFinite(orig) && orig > 0;

    if (valid) {
      // Detect a restart: the AI reset serials back to a small number.
      if (orig <= prevOriginal) {
        // Offset jumps so that the last assigned number is continued.
        offset = counter;
      }
      const assigned = orig + offset;
      (row as Record<string, unknown>).srNo = assigned;
      prevOriginal = orig;
      counter = assigned;
    } else {
      // Null / missing serial — continue the sequence.
      counter += 1;
      (row as Record<string, unknown>).srNo = counter;
      prevOriginal = counter - offset; // keep prevOriginal in "original space"
    }
  }

  return rows;
}
