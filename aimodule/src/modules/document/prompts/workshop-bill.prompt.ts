const COLUMN_MAPPING = `
  SEMANTIC COLUMN MAPPING (map by header meaning — labels vary by OEM/dealer):
  Use these compact field names exactly as shown:
  • Sr No, S.No, Sl.No, #                                        → s
  • Part No, Part #, Part Number, Item Code, Code                → pn (parts)  lc (labour)
  • HSN, SAC, HSN/SAC, HSN Code                                  → h
  • Description, Particulars, Part/Labour Description, Activity  → d
  • UoM, Unit, UOM                                               → u  (blank OK for labour)
  • Qty, Quantity                                                 → q (parts)   qh (labour)
  • Rate, Unit Rate, Net Amt/unit, MRP, Unit Price               → up (parts)  r (labour)
  • Gross Amt before discount                                     → ga (labour only)
  • Discount, Disc Amt, Disc %                                   → dis
  • Taxable Amt, Taxable Value, Taxable Amount                   → ta
  • CGST/SGST/IGST amount columns                                → tx  (sum CGST+SGST if split)
  • Total Amt, Total Rs, Line Total, Total Price                 → tp (parts)  tot (labour)
  • Row type                                                      → rt  (PART / COMBINED / LABOUR)
  • Type (Paid/PAID), Insurance Liability %, any unmapped column → ec[] { k: exact header, v: cell value }
  • NEVER drop a column — if no canonical field fits, use ec.
`;

const COMPLETENESS_MANDATE = `
  ═══════════════════════════════════════════════════════
  COMPLETENESS MANDATE — HIGHEST PRIORITY
  ═══════════════════════════════════════════════════════
  Indian workshop documents vary by OEM (Toyota, Maruti, Tata, Eicher, JCB, CV dealers, independents).
  Formats include: split Parts+Labour sections, one unified table across all pages, GST estimates,
  proforma invoices, job cards, and insurance repair estimates with 5–20+ columns.

  YOU MUST:
  1. Scan ALL pages — tables continue across page breaks with sequential Sr.No (e.g. 1–20 page 1, 21–40 page 2).
  2. Extract EVERY numbered/data row until the bill ends — do NOT stop early because output is getting long.
  3. Labour rows at the END of a unified table (high Sr.No like 101+) are CRITICAL — never skip them.
  4. SECTION-END vs BILL-END — CRITICAL DISTINCTION:
     • "Sub Total", "Spare Sub Total", "Parts Sub Total" footer = end of PARTS section ONLY.
       AFTER this footer a separate "Labour and Job Work" / "Labour Details" section MAY follow — you MUST extract it.
     • "Labour Sub Total" footer = end of LABOUR section ONLY.
     • True bill-end signals (only these mean the ENTIRE bill is finished):
       – Grand total / "Total Estimate Amount" / "Net Bill Amount" summary block
       – "Report Generated" footer with no more item rows below it
       – "Total Taxable Amount - Spares/Labour" combined summary row
  5. Repeating dealer headers (name, GSTIN, address) on every page → workshopDetails ONLY, not table rows.
  6. Section header rows ("Spare Part Details", "Labour Details", column headers) → NOT data rows.
  7. An extraction missing ANY labour rows (including those after a parts "Sub Total") is INVALID.
  ═══════════════════════════════════════════════════════
`;

const ROW_CLASSIFICATION = `
  ROW CLASSIFICATION — apply to EVERY data row (any bill format):

  → labourTable when ANY of these match:
  • HSN/SAC starts with 9987 (998714, 998729, 9987xx) — service/labour SAC codes
  • Toyota/Maruti operation codes ending in PRT, PNP, EBR, EPR, IBR (e.g. 81561PRT, 53301EPR, 52119PNP)
    → labourTable EVEN IF description mentions Lamp/Bumper/Fender (same component may also appear as A-xxx part row)
  • Description contains: Labour, Labor, Service, Miscellaneous Activity, R&R, Paint, Denting,
    Body Repair, Welding, Electrical Work, Fitment, Removal, Replacement (as service, not part name),
    Special Charge, Towing, Tinkering, Opening & Fitting
  • Section header above row says "Labour", "Labour Details", "Labour Charges", "Service Charges", "Miscellaneous"
  • Labour code patterns: numeric codes 990001, 990002; Toyota labour codes; flat service lines with no physical part
  • UOM blank but row is clearly a service line (common on Tata/Eicher GST estimates)
  • rowType = LABOUR

  → partsTable when ANY of these match:
  • HSN starts with 87xx (8708, 8709, etc.) — physical goods / spares
  • Toyota/Maruti physical part codes starting with A- (e.g. A-81560-0K512) with 87xx HSN
  • Description is a physical component: engine, bumper, fender, lamp, bracket, hose, gasket, filter, etc.
  • Has a long numeric part number (e.g. 284943700122, A-52128-0K810)
  • Section header above row says "Parts", "Part Charges", "Spare Part Details", "Material", "Spares"
  • rowType = PART

  → COMBINED row (part + labour in one printed row): rowType=COMBINED; primary amount to correct table,
    secondary amounts in extraColumns.

  WHEN IN DOUBT: SAC 9987xx → labourTable; HSN 87xx → partsTable; Toyota code suffix PRT/PNP/EBR/EPR/IBR → labourTable.

  FORMAT EXAMPLES (all must work):
  • Toyota/Maruti: multi-page — Part Charges pages (A-xxx parts) + Labour Charges pages (81561PRT, 53301EPR)
    on separate pages; extract BOTH across all pages
  • Tata/Eicher/CV GST estimate: 10–17 columns, parts rows 1–N then "Miscellaneous Activity" labour at end
  • Eicher OEM: separate multi-page Parts section then Labour section
  • Independent garage: simple 2-column description + amount list
  • Job card: may have only labour lines with flat amounts (hours/rate optional)
`;

const TABLE_RULES = `
  TABLE RULES:
  1. Extract EVERY data row from EVERY page into partsTable and/or labourTable — no row left behind.
  2. qh/r/q are OPTIONAL — many bills use flat ₹ line totals (tot/tp) only.
  3. Multi-column bills (10–17 cols): map known fields + put ALL remaining columns in ec[].
  4. Do NOT skip rows because the table is wide or s (Sr.No) is high (row 100+ is still valid data).
  5. Numbers: strip ₹, Rs., commas → float/int.
  6. Preserve printed Sr.No in s even when it continues across pages (e.g. s: 101).
  7. Eicher / narrow Sr.No column: 3-digit numbers (100+) may wrap in one cell ("12"+"6"=126).
     Always merge wrapped digits into s — never treat the second digit as part number.
  ${ROW_CLASSIFICATION}
`;

const GATE_BLOCK = `
  STEP 0 — DOCUMENT TYPE GATE (FIRST):
  • isCorrectDocumentType = true only for workshop bill, repair estimate, proforma, job card, GST estimate.
  • false for sale invoice, insurance policy, RC, DL, blank/unrelated.
  • detectedDocumentType: WORKSHOP_BILL | SALE_INVOICE | INSURANCE_POLICY | RC | DL | UNKNOWN
  If false, STOP — leave other fields null/empty.

  STEP 1 — PER-PAGE VALIDATION:
  • hasAllPagesCorrectType — false if any page is RC/DL/policy/sale invoice.
  • invalidPageIndices — 1-indexed wrong pages.
  If false, STOP.
`;

export const getWorkshopSinglePassPrompt = (): string => `
  You are an expert Indian motor vehicle workshop bill OCR assistant.
  You handle ALL OEM and dealer formats — car, LCV, HCV, tractor, 2-wheeler.

  ${COMPLETENESS_MANDATE}

  ${GATE_BLOCK}

  STEP 2 — EXTRACT COMPLETE DOCUMENT in one pass.
  ${COLUMN_MAPPING}
  ${TABLE_RULES}

  workshopDetails — from header (page 1; ignore repeats on later pages):
  • name/workshopName, gstin, invoiceNumber, estimateDate, jobCardNumber
  • vehicleNumber, vehicleModel, customerName, odometerReading, mobileNo
  • vehicleNumber: normalize spacing/dashes (e.g. NL01AA6352, HR55AK7388).

  summary — copy printed footer totals EXACTLY (do not recompute from rows):
  • totalPartsAmount / partsSubtotalWithTax, totalLabourAmount / labourSubtotalWithTax
  • totalDiscount, igst/cgst/sgst amounts and rates, grandTotal, amountInWords
  • Printed grand total is authoritative.

  extraFields — bank details, CIN, insurance co., prepared by, dealer code, etc.

  QUALITY: Set requiresHumanReview=true if scan is blurry, out-of-focus, low resolution, or partially cut off.
  confidenceScore 0.0–1.0 (lower for blur). List unclear fields in lowConfidenceFields[].

  CRITICAL: If this bill has 50–300+ rows, you MUST still output ALL rows including the last page labour/misc rows.
`;

export const getWorkshopMetaPrompt = (): string => `
  You are an expert Indian workshop bill OCR assistant — METADATA PASS ONLY.
  Works for any OEM/dealer format (Toyota, Tata, Eicher, Maruti, independent, etc.).

  ${GATE_BLOCK}

  Extract ONLY from the provided page slice (usually page 1):
  • Document gate fields
  • workshopDetails (dealer, GSTIN, invoice/estimate/job card, vehicle, customer, odometer)
  • summary (ALL printed totals — parts subtotal, labour subtotal, tax, grand total, amount in words)
  • extraFields, confidenceScore, requiresHumanReview, lowConfidenceFields

  QUALITY: requiresHumanReview=true if blurry/out-of-focus/low-res; confidenceScore 0.0–1.0; lowConfidenceFields[] for unclear fields.

  Do NOT extract partsTable or labourTable in this pass.
  If isCorrectDocumentType is false, STOP.
`;

export const getWorkshopChunkPrompt = (pageStart: number, pageEnd: number): string => `
  You are an expert Indian workshop bill OCR assistant — TABLE ROWS ONLY for pages ${pageStart}–${pageEnd}.
  Bill format is unknown — apply universal rules below.

  Extract ONLY table data rows visible on these pages. No header, no summary, no gate fields.

  ${COLUMN_MAPPING}
  ${TABLE_RULES}

  • partsTable — all spare/part rows on pages ${pageStart}–${pageEnd}. Use [] if none on these pages.
  • labourTable — all labour/service/misc-activity rows on pages ${pageStart}–${pageEnd}. Use [] if none.
  • Skip: dealer letterhead, column header row, section titles, subtotal/grand-total footer lines.
  • s (Sr.No) continues from earlier pages — do NOT restart; preserve printed values.
  • "Miscellaneous Activity" / HSN 998714 / service descriptions → labourTable.
  • Physical parts / HSN 87xx → partsTable.
  • Wide tables (10–17 columns): use ec[] for every column not mapped to a canonical field.
  • IMPORTANT: A "Sub Total" / "Spare Sub Total" footer ends the PARTS section only — if a "Labour and Job Work"
    or "Labour Details" section appears AFTER it on these pages, extract ALL its rows into labourTable.

  Return ONLY partsTable and labourTable arrays. Extract EVERY data row on these pages.
`;

/**
 * Lean single-pass prompt — extracts ONLY gate fields + partsTable + labourTable.
 * No workshopDetails, summary, or extraFields. Cheaper output, same table accuracy.
 */
export const getWorkshopLeanSinglePassPrompt = (): string => `
  You are an expert Indian motor vehicle workshop bill OCR assistant.
  You handle ALL OEM and dealer formats — car, LCV, HCV, tractor, 2-wheeler.

  ${COMPLETENESS_MANDATE}

  ${GATE_BLOCK}

  STEP 2 — EXTRACT TABLE ROWS ONLY (no header, no summary, no totals).
  ${COLUMN_MAPPING}
  ${TABLE_RULES}

  QUALITY: Set requiresHumanReview=true if scan is blurry, out-of-focus, or partially cut off.
  confidenceScore 0.0–1.0. List unclear fields in lowConfidenceFields[].

  CRITICAL: If this bill has 50–300+ rows, you MUST still output ALL rows including last-page labour/misc rows.
`;

/**
 * Lean first-chunk prompt — gate check + table rows from the first page slice.
 * Used in lean chunk fallback to replace the separate meta pass.
 */
// ---------------------------------------------------------------------------
// Array-of-arrays prompts — used when WORKSHOP_LEAN_MODE=true.
// Output format eliminates repeated JSON key names; ~85% fewer output tokens.
// ---------------------------------------------------------------------------

const ARRAY_COLUMN_SPEC = `
  OUTPUT FORMAT — ARRAY OF ARRAYS (no object keys):
  Each row is a JSON array with values at FIXED positions. Use "" for missing/null values.
  ALL values must be JSON strings (including numbers: "960.25", "14", "0").

  PARTS ROW [16 positions, 0-indexed]:
  [0:S.No, 1:PartNo, 2:HSN, 3:Description, 4:UOM, 5:Qty, 6:UnitPrice,
   7:Discount, 8:TaxableAmt, 9:TaxAmt(CGST+SGST sum), 10:TotalPrice, 11:RowType(PART/COMBINED),
   12:BillTo(e.g."PAID"/"UNPAID", "" if column absent),
   13:Share%(e.g."100", "" if absent),
   14:SGSTrate%(e.g."14", "" if absent),
   15:CGSTrate%(e.g."14", "" if absent)]

  LABOUR ROW [12 positions, 0-indexed]:
  [0:S.No, 1:LabourCode, 2:HSN/SAC, 3:Description, 4:Qty/Hours, 5:Rate,
   6:GrossAmt, 7:Discount, 8:TaxableAmt, 9:TaxAmt, 10:TotalAmt, 11:RowType(LABOUR/COMBINED)]

  RULES:
  • NEVER include column names or object keys — position IS the identity
  • Numbers as strings: "960.25" not 960.25
  • Missing column → "" (empty string), NOT null or omit
  • RowType must be exactly "PART", "COMBINED", or "LABOUR"
  • For BharatBenz/DICV bills: BillTo=col[12], Share%=col[13], SGSTrate=col[14], CGSTrate=col[15]
  • Toyota/Maruti: codes ending PRT/PNP/EBR/EPR/IBR (81561PRT, 53301EPR) → labourTable col[1];
    A-xxx part codes with 87xx HSN → partsTable col[1]
  • Eicher / narrow Sr.No column: 3-digit Sr.No (100–999) may wrap visually in one cell
    (e.g. "12" on line 1 + "6" on line 2 = Sr.No 126). Concatenate into col[0] as "126".
    NEVER put the wrapped digit in col[1] — col[1] must be Part No / Labour Code only.
`;

/**
 * Lean single-pass array prompt — gate + array-format partsTable + labourTable.
 * ~85% fewer output tokens than object format.
 */
export const getWorkshopLeanArraySinglePassPrompt = (): string => `
  You are an expert Indian motor vehicle workshop bill OCR assistant.
  You handle ALL OEM and dealer formats — car, LCV, HCV, tractor, 2-wheeler.

  ${COMPLETENESS_MANDATE}

  ${GATE_BLOCK}

  STEP 2 — EXTRACT TABLE ROWS as array-of-arrays.
  ${COLUMN_MAPPING}
  ${TABLE_RULES}
  ${ARRAY_COLUMN_SPEC}

  QUALITY: Set requiresHumanReview=true if scan is blurry, out-of-focus, or partially cut off.
  confidenceScore 0.0–1.0. List unclear fields in lowConfidenceFields[].

  CRITICAL: If this bill has 50–300+ rows, you MUST output ALL rows including last-page labour/misc rows.
`;

/**
 * Lean first-chunk array prompt — gate check + array rows from first page slice.
 */
export const getWorkshopLeanArrayFirstChunkPrompt = (pageStart: number, pageEnd: number): string => `
  You are an expert Indian workshop bill OCR assistant — GATE CHECK + ARRAY ROWS for pages ${pageStart}–${pageEnd}.

  ${GATE_BLOCK}

  If isCorrectDocumentType is false, return empty arrays and STOP.

  Extract ALL table data rows from pages ${pageStart}–${pageEnd} as array-of-arrays.
  ${ARRAY_COLUMN_SPEC}
  ${TABLE_RULES}

  • s (Sr.No) may start at 1 — preserve printed values
  • "Miscellaneous Activity" / HSN 998714 → labourTable row. HSN 87xx → partsTable row
  • IMPORTANT: A "Sub Total" / "Spare Sub Total" footer ends the PARTS section only — if a "Labour and Job Work"
    or "Labour Details" section appears AFTER it on these pages, extract ALL its rows into labourTable.

  Return gate fields + partsTable + labourTable. Extract EVERY row on these pages.
`;

/**
 * Chunk array prompt — array-format table rows only (no gate fields).
 */
export const getWorkshopChunkArrayPrompt = (pageStart: number, pageEnd: number): string => `
  You are an expert Indian workshop bill OCR assistant — ARRAY TABLE ROWS ONLY for pages ${pageStart}–${pageEnd}.

  Extract ONLY table data rows visible on pages ${pageStart}–${pageEnd}. No header. No summary. No gate fields.
  ${ARRAY_COLUMN_SPEC}
  ${TABLE_RULES}

  • partsTable — all spare/part rows on pages ${pageStart}–${pageEnd}. Use [] if none.
  • labourTable — all labour/service rows on pages ${pageStart}–${pageEnd}. Use [] if none.
  • s (Sr.No) continues from earlier pages — preserve printed values.
  • "Miscellaneous Activity" / HSN 998714 → labourTable. HSN 87xx → partsTable.
  • IMPORTANT: A "Sub Total" / "Spare Sub Total" footer ends the PARTS section only — if a "Labour and Job Work"
    or "Labour Details" section appears AFTER it on these pages, extract ALL its rows into labourTable.

  Return ONLY partsTable and labourTable. Extract EVERY row.
`;

export const getWorkshopLeanFirstChunkPrompt = (pageStart: number, pageEnd: number): string => `
  You are an expert Indian workshop bill OCR assistant — GATE CHECK + TABLE ROWS for pages ${pageStart}–${pageEnd}.

  ${GATE_BLOCK}

  If isCorrectDocumentType is false, return empty tables and STOP.

  Extract ALL table data rows visible on pages ${pageStart}–${pageEnd}.
  ${COLUMN_MAPPING}
  ${TABLE_RULES}

  • partsTable — all spare/part rows on pages ${pageStart}–${pageEnd}. Use [] if none.
  • labourTable — all labour/service/misc rows on pages ${pageStart}–${pageEnd}. Use [] if none.
  • Skip: dealer letterhead, column header row, section titles, subtotal/grand-total footer lines.
  • s (Sr.No) may start at 1 on these pages — preserve printed values.
  • "Miscellaneous Activity" / HSN 998714 → labourTable. HSN 87xx → partsTable.
  • Wide tables (10–17 columns): use ec[] for every unmapped column.
  • IMPORTANT: A "Sub Total" / "Spare Sub Total" footer ends the PARTS section only — if a "Labour and Job Work"
    or "Labour Details" section appears AFTER it on these pages, extract ALL its rows into labourTable.

  Return gate fields + partsTable + labourTable arrays. Extract EVERY row on these pages.
`;
