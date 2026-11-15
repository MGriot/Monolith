/**
 * Readable message from a failed API call. FastAPI sends `detail` as a string for HTTPException and as an array of
 * `{ loc, msg, type }` for 422 validation errors; reading it raw showed the array as "[object Object]".
 */
export function errorMessage(error: unknown, fallback: string): string {
  const e = error as { response?: { data?: { detail?: unknown } } } | null | undefined;
  const detail = e?.response?.data?.detail;
  if (typeof detail === 'string') return detail || fallback;
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return fallback;
}
