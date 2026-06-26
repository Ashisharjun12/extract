/** True when Gemini hit maxOutputTokens or returned truncated JSON. */
export function isGeminiTruncationError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return msg.includes('response_truncated') || msg.includes('max_tokens');
}

/** True when Gemini rejects responseSchema as too complex (400 INVALID_ARGUMENT). */
export function isGeminiSchemaComplexityError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('too many states') ||
    (msg.includes('invalid_argument') && msg.includes('schema'))
  );
}

/** Policy multipass fallback triggers on truncation or oversized single-pass schema. */
export function shouldPolicyMultipassFallback(err: unknown): boolean {
  return isGeminiTruncationError(err) || isGeminiSchemaComplexityError(err);
}
