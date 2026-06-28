/** Format any extraction field value for display in the tester UI. */
export function formatFieldValue(value) {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (Array.isArray(value)) {
    if (value.length === 0) return '—'
    if (typeof value[0] !== 'object') return value.join(', ')
    return JSON.stringify(value, null, 2)
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

/** Map legacy period/IDV keys from older extractions into strict spec fields. */
export function normalizePolicyResult(result) {
  if (!result || typeof result !== 'object') return {}
  const out = { ...result }

  if (!out.policyStartDate && out.ownDamagePeriodFrom) {
    out.policyStartDate = out.ownDamagePeriodFrom
  }
  if (!out.policyEndDate && out.ownDamagePeriodTo) {
    out.policyEndDate = out.ownDamagePeriodTo
  }
  if (!out.policyStartDate && out.liabilityPeriodFrom) {
    out.policyStartDate = out.liabilityPeriodFrom
  }
  if (!out.policyEndDate && out.liabilityPeriodTo) {
    out.policyEndDate = out.liabilityPeriodTo
  }
  if (out.totalIdv == null && out.vehicleIdv != null) {
    out.totalIdv = out.vehicleIdv
  }

  return out
}

function formatInr(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return formatFieldValue(value)
  return `₹${n.toLocaleString('en-IN')}`
}

/** Policy-specific display formatting (currency, NCB %, booleans). */
export function formatPolicyFieldValue(key, value) {
  if (value == null || value === '') return '—'
  if (key === 'grossPremiumPaid' || key === 'totalIdv') return formatInr(value)
  if (key === 'ncbPercentage') {
    const n = Number(value)
    return Number.isNaN(n) ? formatFieldValue(value) : `${n}%`
  }
  if (key === 'opted' || typeof value === 'boolean') return value ? 'Yes' : 'No'
  return formatFieldValue(value)
}

function pickLabeledPolicyRows(source, specs) {
  return specs.map(({ key, label }) => ({
    key: label,
    value: formatPolicyFieldValue(key, source?.[key]),
  }))
}

function formatAddOnCoversSummary(covers) {
  if (!Array.isArray(covers) || covers.length === 0) return '—'
  const names = covers
    .filter((c) => c?.opted !== false)
    .map((c) => c?.name)
    .filter(Boolean)
  return names.length ? names.join(', ') : '—'
}

function getAt(obj, path) {
  if (!obj || !path) return undefined
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

/** Build key/value rows from explicit field keys (includes nulls). */
export function pickFieldRows(source, keys, { prefix = '' } = {}) {
  if (!source) return []
  return keys.map((key) => {
    const path = prefix ? `${prefix}.${key}` : key
    const value = prefix ? getAt(source, path) : source[key]
    return { key: path, value: formatFieldValue(value) }
  })
}

/** Flatten nested object status blocks into dotted keys. */
export function expandNestedRows(source, prefix, keys) {
  const base = getAt(source, prefix)
  if (!base || typeof base !== 'object') {
    return keys.map((key) => ({ key: `${prefix}.${key}`, value: '—' }))
  }
  return keys.map((key) => ({
    key: `${prefix}.${key}`,
    value: formatFieldValue(base[key]),
  }))
}

/** Every scalar / nested path in the result (includes nulls). */
export function flattenAllFields(obj, prefix = '') {
  if (!obj || typeof obj !== 'object') return []
  const rows = []

  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value == null) {
      rows.push({ key: path, value: '—' })
      continue
    }
    if (Array.isArray(value)) {
      rows.push({ key: path, value: formatFieldValue(value) })
      continue
    }
    if (typeof value === 'object') {
      rows.push(...flattenAllFields(value, path))
      continue
    }
    rows.push({ key: path, value: formatFieldValue(value) })
  }

  return rows.sort((a, b) => a.key.localeCompare(b.key))
}

export function tableColumnsFromRows(rows, preferred = []) {
  if (!rows?.length) return preferred
  const keys = new Set()
  for (const row of rows) {
    if (row && typeof row === 'object') {
      Object.keys(row).forEach((k) => keys.add(k))
    }
  }
  const ordered = preferred.filter((k) => keys.has(k))
  const rest = [...keys].filter((k) => !ordered.includes(k)).sort()
  return [...ordered, ...rest]
}

// ── DL fields ────────────────────────────────────────────────────────────────
const DL_LICENCE = [
  'dlNumber', 'dlNumberNormalized', 'name', 'dob', 'address', 'state',
]
const DL_VALIDITY = ['issueDate', 'validityNT', 'issuingRto']
const DL_STATUS = ['isNTValid', 'isExpired']
const DL_CLASS_COLUMNS = ['vehicleClass', 'issuedOn']
const DL_QUALITY = [
  'isCorrectDocumentType', 'detectedDocumentType', 'hasAllPagesCorrectType',
  'invalidPageIndices', 'confidenceScore', 'requiresHumanReview', 'lowConfidenceFields',
]

// ── RC fields ─────────────────────────────────────────────────────────────────
const RC_VEHICLE = [
  'registrationNo', 'manufacturer', 'modelNo', 'vehicleClass', 'colour', 'fuel',
  'registrationDate', 'regValidity', 'fitnessValidUpto',
  'seatingCapacity', 'unladenWeight', 'ladenWeight',
  'chassisNo', 'engineNo', 'state',
]
const RC_OWNER = ['ownerName']
const RC_AUTHORITY = ['issuingAuthority', 'rtoCode']
const RC_STATUS = ['isValid', 'isExpired', 'daysUntilExpiry']
const RC_QUALITY = [
  'isCorrectDocumentType', 'detectedDocumentType', 'hasAllPagesCorrectType',
  'invalidPageIndices', 'confidenceScore', 'requiresHumanReview', 'lowConfidenceFields',
]

// ── Policy fields (strict spec — human-readable labels) ───────────────────────
const POLICY_OVERVIEW = [
  { key: 'policyNumber', label: 'Policy No.' },
  { key: 'insurerName', label: 'Insurer Name' },
  { key: 'insuredName', label: 'Insured Name' },
  { key: 'insuredAddress', label: 'Address' },
  { key: 'registrationNo', label: 'Vehicle No.' },
  { key: 'policyType', label: 'Policy Type' },
  { key: 'policyCoverage', label: 'Coverage' },
  { key: 'totalIdv', label: 'Sum Insured (IDV)' },
  { key: 'policyStartDate', label: 'Policy Start Date' },
  { key: 'policyEndDate', label: 'Policy End Date' },
  { key: 'ncbPercentage', label: 'NCB %' },
  { key: 'grossPremiumPaid', label: 'Premium' },
  { key: 'engineNo', label: 'Engine No.' },
  { key: 'chassisNo', label: 'Chassis No.' },
  { key: 'nomineeName', label: 'Nominee Name' },
  { key: 'registrationAuthority', label: 'Zone / RTO Code' },
]

const POLICY_IDENTITY = [
  { key: 'policyNumber', label: 'Policy No.' },
  { key: 'policyType', label: 'Policy Type' },
  { key: 'policyCoverage', label: 'Coverage' },
]
const POLICY_INSURER = [{ key: 'insurerName', label: 'Insurer Name' }]
const POLICY_INSURED = [
  { key: 'insuredName', label: 'Insured Name' },
  { key: 'insuredAddress', label: 'Address' },
]
const POLICY_PERIOD = [
  { key: 'policyStartDate', label: 'Policy Start Date' },
  { key: 'policyEndDate', label: 'Policy End Date' },
]
const POLICY_VEHICLE = [
  { key: 'registrationNo', label: 'Vehicle No.' },
  { key: 'engineNo', label: 'Engine No.' },
  { key: 'chassisNo', label: 'Chassis No.' },
  { key: 'registrationAuthority', label: 'Zone / RTO Code' },
]
const POLICY_IDV = [{ key: 'totalIdv', label: 'Sum Insured (IDV)' }]
const POLICY_NCB = [
  { key: 'ncbPercentage', label: 'NCB %' },
  { key: 'grossPremiumPaid', label: 'Premium' },
]
const POLICY_NOMINEE = [{ key: 'nomineeName', label: 'Nominee Name' }]
const POLICY_QUALITY = [
  { key: 'isCorrectDocumentType', label: 'Correct document type' },
  { key: 'detectedDocumentType', label: 'Detected type' },
  { key: 'hasAllPagesCorrectType', label: 'All pages correct type' },
  { key: 'invalidPageIndices', label: 'Invalid page indices' },
  { key: 'confidenceScore', label: 'Confidence score' },
  { key: 'requiresHumanReview', label: 'Requires human review' },
]

// ── Workshop fields ───────────────────────────────────────────────────────────
const WORKSHOP_META = [
  'vehicleNumber', 'vehicleState', 'billType', 'grandTotalVerified',
  'isCorrectDocumentType', 'detectedDocumentType', 'hasAllPagesCorrectType',
  'invalidPageIndices', 'confidenceScore', 'requiresHumanReview',
]
const PARTS_COLUMNS = [
  'srNo', 'partNumber', 'hsnSac', 'description', 'uom', 'quantity',
  'unitPrice', 'discount', 'taxableAmount', 'taxAmount', 'totalPrice', 'rowType',
]
const LABOUR_COLUMNS = [
  'srNo', 'labourCode', 'hsnSac', 'description', 'quantityOrHours', 'rate',
  'grossAmount', 'discount', 'taxableAmount', 'taxAmount', 'totalAmount', 'rowType',
]

function fieldTab(id, label, rows) {
  return { id, label, kind: 'fields', rows }
}

function tableTab(id, label, rows, columns) {
  return {
    id,
    label,
    kind: 'table',
    rows: rows ?? [],
    columns: tableColumnsFromRows(rows, columns),
  }
}

function formatTableRows(rows) {
  if (!rows?.length) return []
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row
    const out = {}
    for (const [k, v] of Object.entries(row)) {
      out[k] = k === 'opted' ? formatPolicyFieldValue('opted', v) : formatFieldValue(v)
    }
    return out
  })
}

function policyFieldTab(id, label, source, specs) {
  return fieldTab(id, label, pickLabeledPolicyRows(source, specs))
}

function extraFieldsTab(result) {
  const rows = result?.extraFields ?? []
  if (!Array.isArray(rows) || rows.length === 0) return null
  return tableTab('extra', 'Extra fields', formatTableRows(rows), ['key', 'value'])
}

/** Build doc-type-specific tabs for the extraction inspect dialog. */
export function buildInspectViews(documentType, result) {
  if (!result) {
    return { tabs: [{ id: 'json', label: 'Raw JSON', kind: 'json' }], defaultTab: 'json' }
  }

  const normalizedResult = documentType === 'POLICY' ? normalizePolicyResult(result) : result
  const allTab = fieldTab('all', 'All fields', flattenAllFields(normalizedResult))
  const jsonTab = { id: 'json', label: 'Raw JSON', kind: 'json' }

  switch (documentType) {
    case 'DL': {
      const tabs = [
        fieldTab('licence', 'Licence', pickFieldRows(result, DL_LICENCE)),
        fieldTab('validity', 'Validity', pickFieldRows(result, DL_VALIDITY)),
        fieldTab('status', 'DL status', expandNestedRows(result, 'dlStatus', DL_STATUS)),
        tableTab('classes', 'Vehicle classes', formatTableRows(result.vehicleClasses), DL_CLASS_COLUMNS),
        fieldTab('quality', 'Quality', pickFieldRows(result, DL_QUALITY)),
        allTab,
        jsonTab,
      ]
      return { tabs, defaultTab: 'licence' }
    }

    case 'RC': {
      const tabs = [
        fieldTab('vehicle', 'Vehicle', pickFieldRows(result, RC_VEHICLE)),
        fieldTab('owner', 'Owner', pickFieldRows(result, RC_OWNER)),
        fieldTab('authority', 'Authority', pickFieldRows(result, RC_AUTHORITY)),
        fieldTab('status', 'RC status', expandNestedRows(result, 'rcStatus', RC_STATUS)),
        fieldTab('quality', 'Quality', pickFieldRows(result, RC_QUALITY)),
        allTab,
        jsonTab,
      ].filter(Boolean)
      return { tabs, defaultTab: 'vehicle' }
    }

    case 'POLICY': {
      const r = normalizePolicyResult(result)
      const overviewRows = [
        ...pickLabeledPolicyRows(r, POLICY_OVERVIEW),
        { key: 'Add-on Covers', value: formatAddOnCoversSummary(r.addOnCovers) },
      ]
      const coversTab = Array.isArray(r.addOnCovers) && r.addOnCovers.length > 0
        ? tableTab('covers', 'Add-on covers', formatTableRows(r.addOnCovers), ['name', 'opted'])
        : null

      const tabs = [
        fieldTab('overview', 'Overview', overviewRows),
        policyFieldTab('policy', 'Policy', r, POLICY_IDENTITY),
        policyFieldTab('insurer', 'Insurer', r, POLICY_INSURER),
        policyFieldTab('insured', 'Insured', r, POLICY_INSURED),
        policyFieldTab('period', 'Period', r, POLICY_PERIOD),
        policyFieldTab('vehicle', 'Vehicle', r, POLICY_VEHICLE),
        policyFieldTab('idv', 'IDV', r, POLICY_IDV),
        policyFieldTab('ncb', 'NCB & Premium', r, POLICY_NCB),
        coversTab,
        policyFieldTab('nominee', 'Nominee', r, POLICY_NOMINEE),
        policyFieldTab('quality', 'Quality', r, POLICY_QUALITY),
        allTab,
        jsonTab,
      ].filter(Boolean)
      return { tabs, defaultTab: 'overview' }
    }

    case 'WORKSHOP': {
      const tabs = [
        tableTab('parts', 'Parts table', formatTableRows(result.partsTable), PARTS_COLUMNS),
        tableTab('labour', 'Labour table', formatTableRows(result.labourTable), LABOUR_COLUMNS),
        fieldTab('quality', 'Quality', pickFieldRows(result, WORKSHOP_META)),
        extraFieldsTab(result),
        allTab,
        jsonTab,
      ].filter(Boolean)
      return { tabs, defaultTab: 'parts' }
    }

    default:
      return { tabs: [allTab, jsonTab], defaultTab: 'all' }
  }
}
