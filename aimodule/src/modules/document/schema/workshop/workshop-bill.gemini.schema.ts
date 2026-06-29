import { Schema, Type } from '@google/genai';

// Short keys reduce output tokens by ~25% on dense 300-row bills.
// Expansion back to full names happens in expandWorkshopShortKeys() before Zod validation.
const extraColumnItem: Schema = {
  type: Type.OBJECT,
  properties: {
    k: { type: Type.STRING, description: 'Original column header as printed on the bill' },
    v: { type: Type.STRING, nullable: true, description: 'Cell value as string' },
  },
};

const documentGateProps: Record<string, Schema> = {
  isCorrectDocumentType: {
    type: Type.BOOLEAN,
    description:
      'Set true ONLY for workshop bill, repair estimate, proforma, or job card. ' +
      'False for sale invoice, insurance policy, RC, DL, or unrelated documents.',
  },
  detectedDocumentType: {
    type: Type.STRING,
    nullable: true,
    description: 'WORKSHOP_BILL | SALE_INVOICE | INSURANCE_POLICY | RC | DL | UNKNOWN',
  },
  hasAllPagesCorrectType: {
    type: Type.BOOLEAN,
    description: 'True only if every page belongs to the same workshop job.',
  },
  invalidPageIndices: {
    type: Type.ARRAY,
    nullable: true,
    description: '1-indexed page numbers that are not workshop bill pages.',
    items: { type: Type.NUMBER },
  },
  confidenceScore: {
    type: Type.NUMBER,
    description: 'Overall confidence 0.0–1.0.',
  },
  requiresHumanReview: {
    type: Type.BOOLEAN,
    description: 'True if blurry, incomplete, handwritten, or totals do not reconcile.',
  },
};

const partsRowItem: Schema = {
  type: Type.OBJECT,
  properties: {
    s: { type: Type.NUMBER, description: 'Sr. No.' },
    pn: { type: Type.STRING, description: 'Part number / item code' },
    h: { type: Type.STRING, description: 'HSN or SAC code' },
    d: { type: Type.STRING, description: 'Part description' },
    u: { type: Type.STRING, description: 'UoM (NOS, KG, etc.)' },
    q: { type: Type.NUMBER, description: 'Qty' },
    up: { type: Type.NUMBER, description: 'Unit price (Net Amt/unit, Rate, MRP, Unit Price)' },
    dis: { type: Type.NUMBER, description: 'Line discount amount' },
    ta: { type: Type.NUMBER, description: 'Taxable amount before tax' },
    tx: { type: Type.NUMBER, description: 'Line tax — IGST/CGST/SGST amount' },
    tp: { type: Type.NUMBER, description: 'Line total (Total Rs, Total Amt, Line Total)' },
    rt: { type: Type.STRING, description: 'PART or COMBINED' },
    ec: { type: Type.ARRAY, description: 'Unmapped columns — k=exact header, v=cell value', items: extraColumnItem },
  },
};

const labourRowItem: Schema = {
  type: Type.OBJECT,
  properties: {
    s: { type: Type.NUMBER, description: 'Sr. No.' },
    lc: { type: Type.STRING, description: 'Labour / service code' },
    h: { type: Type.STRING, description: 'HSN or SAC code' },
    d: { type: Type.STRING, description: 'Service / labour description' },
    qh: { type: Type.NUMBER, description: 'Hours or qty if printed — omit if flat amount only' },
    r: { type: Type.NUMBER, description: 'Rate per hour/unit if printed' },
    ga: { type: Type.NUMBER, description: 'Gross amount before discount/tax' },
    dis: { type: Type.NUMBER, description: 'Line discount' },
    ta: { type: Type.NUMBER, description: 'Taxable amount' },
    tx: { type: Type.NUMBER, description: 'Line tax amount' },
    tot: { type: Type.NUMBER, description: 'Line total (Total Amt, Labour Charges, Total Rs)' },
    rt: { type: Type.STRING, description: 'LABOUR or COMBINED' },
    ec: { type: Type.ARRAY, description: 'Unmapped columns — k=exact header, v=cell value', items: extraColumnItem },
  },
};

const workshopDetailsProps: Record<string, Schema> = {
  name: { type: Type.STRING, description: 'Workshop or dealer name' },
  gstin: { type: Type.STRING, description: 'Workshop GSTIN' },
  invoiceNumber: { type: Type.STRING, description: 'Invoice, estimate, or bill number' },
  invoiceDate: { type: Type.STRING, description: 'Invoice or estimate date' },
  vehicleNumber: { type: Type.STRING, description: 'Vehicle registration number' },
  documentTitle: { type: Type.STRING, description: 'Title as printed (Estimate, Tax Invoice, etc.)' },
  jobCardNumber: { type: Type.STRING, description: 'Job card number if present' },
  customerName: { type: Type.STRING, description: 'Customer or fleet owner name' },
  odometerReading: { type: Type.STRING, description: 'Odometer / mileage if printed' },
};

const summaryProps: Record<string, Schema> = {
  totalPartsAmount: { type: Type.NUMBER, description: 'Total parts/spares amount (pre-tax if split)' },
  totalLabourAmount: { type: Type.NUMBER, description: 'Total labour amount (pre-tax if split)' },
  partsSubtotalWithTax: { type: Type.NUMBER, description: 'Spare parts subtotal including tax' },
  labourSubtotalWithTax: { type: Type.NUMBER, description: 'Labour subtotal including tax' },
  totalDiscount: { type: Type.NUMBER, description: 'Total discount on bill' },
  totalGstAmount: { type: Type.NUMBER, description: 'Total GST/tax if single combined figure' },
  igstRate: { type: Type.NUMBER },
  igstAmount: { type: Type.NUMBER },
  cgstRate: { type: Type.NUMBER },
  cgstAmount: { type: Type.NUMBER },
  sgstRate: { type: Type.NUMBER },
  sgstAmount: { type: Type.NUMBER },
  grandTotal: { type: Type.NUMBER, description: 'Final invoice / estimate total' },
  amountInWords: { type: Type.STRING, description: 'Amount in words — keep as string, not number' },
};

const gateRequired = [
  'isCorrectDocumentType',
  'detectedDocumentType',
  'hasAllPagesCorrectType',
  'confidenceScore',
  'requiresHumanReview',
];

/**
 * Lean schema — gate fields + partsTable + labourTable only.
 * Omits workshopDetails, summary, extraFields to reduce output tokens.
 */
export const WorkshopLeanGeminiSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    ...documentGateProps,
    partsTable: {
      type: Type.ARRAY,
      description: 'All spare parts / material line items from ALL pages. Use [] if none.',
      items: partsRowItem,
    },
    labourTable: {
      type: Type.ARRAY,
      description: 'All labour / service line items from ALL pages. Use [] if none.',
      items: labourRowItem,
    },
  },
  required: gateRequired,
};

const arrayRow: Schema = {
  type: Type.ARRAY,
  items: { type: Type.STRING },
};

/** Lean single-pass array schema — gate fields + array-format tables. */
export const WorkshopLeanArraySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    ...documentGateProps,
    partsTable: {
      type: Type.ARRAY,
      description: 'Parts rows as positional string arrays — see prompt for column order',
      items: arrayRow,
    },
    labourTable: {
      type: Type.ARRAY,
      description: 'Labour rows as positional string arrays — see prompt for column order',
      items: arrayRow,
    },
  },
  required: gateRequired,
};

/** Chunk fallback array schema — array-format tables only (no gate fields). */
export const WorkshopChunkArraySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    partsTable: {
      type: Type.ARRAY,
      description: 'Parts rows as positional string arrays for this page slice',
      items: arrayRow,
    },
    labourTable: {
      type: Type.ARRAY,
      description: 'Labour rows as positional string arrays for this page slice',
      items: arrayRow,
    },
  },
  required: ['partsTable', 'labourTable'],
};

