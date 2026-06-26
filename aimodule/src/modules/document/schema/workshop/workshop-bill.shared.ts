import { z } from 'zod';

/** Strip ₹, Rs., commas — handles Indian grouping (8,25,795.21 → 825795.21) */
export function preprocessWorkshopNumber(val: unknown): number | null {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const cleanStr = val.replace(/[^0-9.-]+/g, '');
    const num = parseFloat(cleanStr);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export const workshopNumeric = z.preprocess(preprocessWorkshopNumber, z.number().nullable());

export const ExtraColumnSchema = z.object({
  key: z.string(),
  value: z.union([z.string(), z.number(), z.null()]).nullable().optional(),
});

export const ExtraFieldSchema = z.object({
  key: z.string(),
  value: z.string().nullable(),
});

export const WorkshopPartsRowSchema = z.object({
  srNo: workshopNumeric.optional(),
  partNumber: z.string().nullable().optional(),
  hsnSac: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  uom: z.string().nullable().optional(),
  quantity: workshopNumeric.optional(),
  unitPrice: workshopNumeric.optional(),
  discount: workshopNumeric.optional(),
  taxableAmount: workshopNumeric.optional(),
  taxAmount: workshopNumeric.optional(),
  totalPrice: workshopNumeric.optional(),
  rowType: z.enum(['PART', 'COMBINED']).nullable().optional(),
  extraColumns: z.array(ExtraColumnSchema).nullish().default([]),
});

export const WorkshopLabourRowSchema = z.object({
  srNo: workshopNumeric.optional(),
  labourCode: z.string().nullable().optional(),
  hsnSac: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  quantityOrHours: workshopNumeric.optional(),
  rate: workshopNumeric.optional(),
  grossAmount: workshopNumeric.optional(),
  discount: workshopNumeric.optional(),
  taxableAmount: workshopNumeric.optional(),
  taxAmount: workshopNumeric.optional(),
  totalAmount: workshopNumeric.optional(),
  rowType: z.enum(['LABOUR', 'COMBINED']).nullable().optional(),
  extraColumns: z.array(ExtraColumnSchema).nullish().default([]),
});

export const WorkshopSummarySchema = z.object({
  totalPartsAmount: workshopNumeric.optional(),
  totalLabourAmount: workshopNumeric.optional(),
  partsSubtotalWithTax: workshopNumeric.optional(),
  labourSubtotalWithTax: workshopNumeric.optional(),
  totalDiscount: workshopNumeric.optional(),
  totalGstAmount: workshopNumeric.optional(),
  igstRate: workshopNumeric.optional(),
  igstAmount: workshopNumeric.optional(),
  cgstRate: workshopNumeric.optional(),
  cgstAmount: workshopNumeric.optional(),
  sgstRate: workshopNumeric.optional(),
  sgstAmount: workshopNumeric.optional(),
  grandTotal: workshopNumeric.optional(),
  amountInWords: z.string().nullable().optional(),
}).nullable().optional();

export const WorkshopDetailsSchema = z.object({
  name: z.string().nullable().optional(),
  gstin: z.string().nullable().optional(),
  invoiceNumber: z.string().nullable().optional(),
  invoiceDate: z.string().nullable().optional(),
  vehicleNumber: z.string().nullable().optional(),
  documentTitle: z.string().nullable().optional(),
  jobCardNumber: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  odometerReading: z.string().nullable().optional(),
}).nullable().optional();

export const WorkshopDocumentGateSchema = z.object({
  isCorrectDocumentType: z.boolean().optional(),
  detectedDocumentType: z.string().nullable().optional(),
  hasAllPagesCorrectType: z.boolean().optional(),
  invalidPageIndices: z.array(z.number()).nullable().optional(),
  confidenceScore: z.number().min(0).max(1).optional(),
  requiresHumanReview: z.boolean().optional(),
});

/** Default when WORKSHOP_MULTIPASS_PAGE_THRESHOLD env is unset (see config.ts). */
export const WORKSHOP_MULTIPASS_PAGE_THRESHOLD_DEFAULT = 15;

/** Page-chunk size when single-pass hits output truncation (fallback only). */
export const WORKSHOP_CHUNK_PAGE_SIZE = 3;

export { isGeminiTruncationError as isWorkshopTruncationError } from '../../../../utils/gemini-truncation.util.js';

// ---------------------------------------------------------------------------
// Short-key expansion — Gemini outputs compact keys (s, pn, h, d …) to save
// ~25% output tokens on dense bills; expand back before Zod validation.
// ---------------------------------------------------------------------------

function expandExtraColumn(c: unknown): { key: unknown; value: unknown } {
  const col = c as Record<string, unknown>;
  return { key: col.k ?? col.key, value: col.v ?? col.value };
}

function expandPartsRow(row: unknown): Record<string, unknown> {
  const r = row as Record<string, unknown>;
  return {
    srNo:          r.s   ?? r.srNo,
    partNumber:    r.pn  ?? r.partNumber,
    hsnSac:        r.h   ?? r.hsnSac,
    description:   r.d   ?? r.description,
    uom:           r.u   ?? r.uom,
    quantity:      r.q   ?? r.quantity,
    unitPrice:     r.up  ?? r.unitPrice,
    discount:      r.dis ?? r.discount,
    taxableAmount: r.ta  ?? r.taxableAmount,
    taxAmount:     r.tx  ?? r.taxAmount,
    totalPrice:    r.tp  ?? r.totalPrice,
    rowType:       r.rt  ?? r.rowType,
    extraColumns: Array.isArray(r.ec ?? r.extraColumns)
      ? ((r.ec ?? r.extraColumns) as unknown[]).map(expandExtraColumn)
      : [],
  };
}

function expandLabourRow(row: unknown): Record<string, unknown> {
  const r = row as Record<string, unknown>;
  return {
    srNo:            r.s   ?? r.srNo,
    labourCode:      r.lc  ?? r.labourCode,
    hsnSac:          r.h   ?? r.hsnSac,
    description:     r.d   ?? r.description,
    quantityOrHours: r.qh  ?? r.quantityOrHours,
    rate:            r.r   ?? r.rate,
    grossAmount:     r.ga  ?? r.grossAmount,
    discount:        r.dis ?? r.discount,
    taxableAmount:   r.ta  ?? r.taxableAmount,
    taxAmount:       r.tx  ?? r.taxAmount,
    totalAmount:     r.tot ?? r.totalAmount,
    rowType:         r.rt  ?? r.rowType,
    extraColumns: Array.isArray(r.ec ?? r.extraColumns)
      ? ((r.ec ?? r.extraColumns) as unknown[]).map(expandExtraColumn)
      : [],
  };
}

/** Expand compact Gemini output keys back to full Zod field names before validation. */
export function expandWorkshopShortKeys(raw: Record<string, unknown>): Record<string, unknown> {
  const rawParts = Array.isArray(raw.partsTable) ? raw.partsTable : [];
  const rawLabour = Array.isArray(raw.labourTable) ? raw.labourTable : [];
  const { partsTable, labourTable } = reclassifyWorkshopShortKeyRows(rawParts, rawLabour);

  return {
    ...raw,
    partsTable: partsTable.map(expandPartsRow),
    labourTable: labourTable.map(expandLabourRow),
  };
}

// ---------------------------------------------------------------------------
// Cross-table row classification — Toyota/Eicher/BharatBenz misroutes
// ---------------------------------------------------------------------------

function normalizeSac(v: unknown): string {
  return String(v ?? '').replace(/\s/g, '');
}

function itemCodeFromArrayRow(row: unknown[]): string {
  return String(row[1] ?? '').trim();
}

function sacFromArrayRow(row: unknown[]): string {
  return normalizeSac(row[2]);
}

function isLabourServiceSac(sac: string): boolean {
  return /^9987/i.test(sac);
}

function isPhysicalPartsHsn(hsn: string): boolean {
  return /^87/i.test(hsn);
}

/** Toyota/Maruti unified estimate labour operation codes (81561PRT, 53301EPR, 52119PNP). */
function isOemLabourOperationCode(code: string): boolean {
  const c = code.trim();
  if (!c) return false;
  // A-prefixed rows are physical parts on Toyota bills
  if (/^A-/i.test(c)) return false;
  return /(PRT|PNP|EBR|EPR|IBR)$/i.test(c);
}

function shouldBeLabourRow(code: string, sac: string): boolean {
  if (isLabourServiceSac(sac)) return true;
  if (isOemLabourOperationCode(code)) return true;
  return false;
}

function shouldBePartsRow(code: string, sac: string): boolean {
  if (isPhysicalPartsHsn(sac)) return true;
  if (/^A-/i.test(code.trim())) return true;
  return false;
}

function codeFromShortKeyRow(row: unknown): string {
  const r = row as Record<string, unknown>;
  return String(r.pn ?? r.partNumber ?? r.lc ?? r.labourCode ?? '').trim();
}

function sacFromShortKeyRow(row: unknown): string {
  const r = row as Record<string, unknown>;
  return normalizeSac(r.h ?? r.hsnSac);
}

function reclassifyWorkshopShortKeyRows(
  rawParts: unknown[],
  rawLabour: unknown[],
): { partsTable: unknown[]; labourTable: unknown[] } {
  const partsTable: unknown[] = [];
  const labourTable: unknown[] = [];

  for (const row of rawLabour) {
    const code = codeFromShortKeyRow(row);
    const sac = sacFromShortKeyRow(row);
    if (shouldBePartsRow(code, sac) && !shouldBeLabourRow(code, sac)) {
      partsTable.push(row);
    } else {
      labourTable.push(row);
    }
  }

  for (const row of rawParts) {
    const code = codeFromShortKeyRow(row);
    const sac = sacFromShortKeyRow(row);
    if (shouldBeLabourRow(code, sac)) {
      labourTable.push(row);
    } else {
      partsTable.push(row);
    }
  }

  return { partsTable, labourTable };
}

// ---------------------------------------------------------------------------
// Array-of-arrays expansion — converts positional string arrays back to the
// full-field-name objects expected by Zod (same schema, no code change needed
// downstream).
//
// Parts row [16 positions]: s, pn, h, d, u, q, up, dis, ta, tx, tp, rt,
//                           bt(BillTo), sh(Share%), sgst%, cgst%
// Labour row [12 positions]: s, lc, h, d, qh, r, ga, dis, ta, tx, tot, rt
// ---------------------------------------------------------------------------

const PARTS_ARRAY_KEYS = [
  'srNo', 'partNumber', 'hsnSac', 'description', 'uom', 'quantity',
  'unitPrice', 'discount', 'taxableAmount', 'taxAmount', 'totalPrice', 'rowType',
] as const;

const PARTS_NUMERIC_IDX = new Set([0, 5, 6, 7, 8, 9, 10]);
const PARTS_EXTRA_LABELS = ['Bill To', 'Share%', 'SGST%', 'CGST%'];

const LABOUR_ARRAY_KEYS = [
  'srNo', 'labourCode', 'hsnSac', 'description', 'quantityOrHours', 'rate',
  'grossAmount', 'discount', 'taxableAmount', 'taxAmount', 'totalAmount', 'rowType',
] as const;

const LABOUR_NUMERIC_IDX = new Set([0, 4, 5, 6, 7, 8, 9, 10]);

function coerceVal(v: unknown, isNumeric: boolean): unknown {
  if (v === undefined || v === null || v === '' || v === 'null') return null;
  if (isNumeric) {
    const n = parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  }
  return String(v);
}

/** Part/labour code at col[1] — alphanumeric OEM IDs (IA*, MF*, ID*), not bare HSN digits. */
function looksLikeItemCode(v: unknown): boolean {
  const s = String(v ?? '').trim();
  if (!s) return false;
  if (/[A-Za-z]/.test(s)) return true;
  // All-digit part codes exist but are longer than a wrapped Sr.No digit
  return /^\d{5,}$/.test(s.replace(/\s/g, ''));
}

/**
 * Eicher bills use a very narrow Sr.No column — 3-digit numbers (100+) wrap in one cell
 * (e.g. "12" + "6" = 126). Flash-lite may emit them as two array positions, shifting all
 * columns left. Merge when col[0]+col[1] forms 100–999 and col[2] is the real item code.
 */
function fixWrappedSrNoArrayRow(arr: unknown[]): unknown[] {
  if (arr.length < 3) return arr;

  const srNo = String(arr[0] ?? '').trim();
  const next = String(arr[1] ?? '').trim();
  if (!/^\d{1,2}$/.test(srNo) || !/^\d{1,2}$/.test(next)) return arr;

  const combined = parseInt(`${srNo}${next}`, 10);
  if (combined < 100 || combined > 999) return arr;
  if (!looksLikeItemCode(arr[2])) return arr;

  return [String(combined), ...arr.slice(2)];
}

/**
 * Fix: flash-lite sometimes skips the UOM column (position 4) when UOM is blank,
 * putting Qty at position 4 and shifting every subsequent column left by one.
 * This makes position 10 = RowType ("PART") instead of TotalPrice → null prices.
 *
 * Detection: position 4 is a pure numeric string (Qty, not UOM) AND position 10
 * is a known RowType keyword instead of a price number.
 */
const KNOWN_ROW_TYPES = new Set(['PART', 'COMBINED', 'LABOUR']);

function fixMissingUomArrayRow(arr: unknown[]): unknown[] {
  if (arr.length < 11) return arr;
  const pos4 = String(arr[4] ?? '').trim();
  const pos10 = String(arr[10] ?? '').trim();
  // Position 4 looks like a plain number (Qty, not UOM like "NOS"/"KG"/etc.)
  // AND position 10 is a RowType word → UOM was omitted, columns shifted.
  const pos4IsNumeric = pos4 !== '' && /^\d+(\.\d+)?$/.test(pos4);
  const pos10IsRowType = KNOWN_ROW_TYPES.has(pos10);
  if (pos4IsNumeric && pos10IsRowType) {
    // Insert empty string at position 4 (UOM) to restore correct alignment.
    return [...arr.slice(0, 4), '', ...arr.slice(4)];
  }
  return arr;
}

function expandPartsArrayRow(arr: unknown[]): Record<string, unknown> {
  const afterSrFix = fixWrappedSrNoArrayRow(arr);
  const fixed = fixMissingUomArrayRow(afterSrFix);
  const row: Record<string, unknown> = {};
  PARTS_ARRAY_KEYS.forEach((k, i) => {
    row[k] = coerceVal(fixed[i], PARTS_NUMERIC_IDX.has(i));
  });
  // Sanitize rowType — partsTable only accepts PART or COMBINED.
  // Flash-lite may output "LABOUR" for cross-table rows; coerce to null (accepted by .nullable()).
  const rt = row.rowType as string | null | undefined;
  if (rt && rt !== 'PART' && rt !== 'COMBINED') {
    row.rowType = null;
  }
  const extras: { key: string; value: string | null }[] = [];
  for (let i = 12; i < Math.min(fixed.length, 16); i++) {
    const v = fixed[i];
    if (v !== undefined && v !== null && v !== '' && v !== 'null') {
      extras.push({ key: PARTS_EXTRA_LABELS[i - 12], value: String(v) });
    }
  }
  row.extraColumns = extras;
  return row;
}

function expandLabourArrayRow(arr: unknown[]): Record<string, unknown> {
  const fixed = fixWrappedSrNoArrayRow(arr);
  const row: Record<string, unknown> = {};
  LABOUR_ARRAY_KEYS.forEach((k, i) => {
    row[k] = coerceVal(fixed[i], LABOUR_NUMERIC_IDX.has(i));
  });
  // Sanitize rowType — labourTable only accepts LABOUR or COMBINED.
  const rt = row.rowType as string | null | undefined;
  if (rt && rt !== 'LABOUR' && rt !== 'COMBINED') {
    row.rowType = null;
  }
  row.extraColumns = [];
  return row;
}

/**
 * Convert array-of-arrays Gemini output to full-field-name objects for Zod validation.
 * Compatible with the existing WorkshopBillSchema — no downstream changes needed.
 *
 * Fix B: cross-table rescue — flash-lite occasionally puts parts rows (HSN 87xx) into
 * labourTable or labour rows (HSN 9987xx) into partsTable. Since parts and labour arrays
 * have different positional layouts, a misrouted row must be detected before expansion
 * (position 2 = hsnSac in both layouts) and expanded with the correct function.
 */
export function expandWorkshopArrayRows(raw: Record<string, unknown>): Record<string, unknown> {
  const rawParts  = Array.isArray(raw.partsTable)  ? (raw.partsTable  as unknown[][]) : [];
  const rawLabour = Array.isArray(raw.labourTable) ? (raw.labourTable as unknown[][]) : [];

  const rescuedFromLabour: unknown[][] = [];
  const trueLabour: unknown[][] = [];

  for (const row of rawLabour) {
    const fixed = fixWrappedSrNoArrayRow(row);
    const code = itemCodeFromArrayRow(fixed);
    const sac = sacFromArrayRow(fixed);
    // HSN 87xx / A-xxx parts misclassified into labourTable
    if (shouldBePartsRow(code, sac) && !shouldBeLabourRow(code, sac)) {
      rescuedFromLabour.push(fixed);
    } else {
      trueLabour.push(fixed);
    }
  }

  const rescuedFromParts: unknown[][] = [];
  const trueParts: unknown[][] = [];

  for (const row of rawParts) {
    const fixed = fixWrappedSrNoArrayRow(row);
    const code = itemCodeFromArrayRow(fixed);
    const sac = sacFromArrayRow(fixed);
    // SAC 9987xx or Toyota PRT/PNP/EBR/EPR/IBR codes misclassified into partsTable
    if (shouldBeLabourRow(code, sac)) {
      rescuedFromParts.push(fixed);
    } else {
      trueParts.push(fixed);
    }
  }

  const finalParts  = [...trueParts,  ...rescuedFromLabour];
  const finalLabour = [...trueLabour, ...rescuedFromParts];

  return {
    ...raw,
    partsTable:  finalParts.map(expandPartsArrayRow),
    labourTable: finalLabour.map(expandLabourArrayRow),
  };
}

/**
 * Returns true when the response uses the new array-of-arrays row format.
 * Detects by checking whether the first row is itself an array.
 */
export function isArrayRowFormat(raw: Record<string, unknown>): boolean {
  if (Array.isArray(raw.partsTable) && raw.partsTable.length > 0) {
    return Array.isArray((raw.partsTable as unknown[])[0]);
  }
  if (Array.isArray(raw.labourTable) && raw.labourTable.length > 0) {
    return Array.isArray((raw.labourTable as unknown[])[0]);
  }
  return false;
}
