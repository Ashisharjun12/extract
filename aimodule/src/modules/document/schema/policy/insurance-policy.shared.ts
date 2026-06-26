/** Default when POLICY_MULTIPASS_PAGE_THRESHOLD env is unset (see config.ts). */
export const POLICY_MULTIPASS_PAGE_THRESHOLD_DEFAULT = 15;

export const POLICY_PAGE_MAP_KEYS = [
  'dataPageIndices',
  'premiumPageIndices',
  'skipPageIndices',
] as const;
