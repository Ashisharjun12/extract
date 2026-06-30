// Resolve total page count for token budgeting.
 
export function resolveDocumentPageCount(inputData: unknown): number {
  const items = Array.isArray(inputData) ? inputData : [inputData];
  let total = 0;

  for (const item of items) {
    if (item && typeof item === 'object' && 'pageCount' in item) {
      const n = (item as { pageCount?: number }).pageCount;
      total += typeof n === 'number' && n > 0 ? n : 1;
    } else {
      total += 1;
    }
  }

  return Math.max(1, total);
}
