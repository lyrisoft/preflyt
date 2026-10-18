const refreshCodes = new Set([
  'GITHUB_SYNC_PENDING',
  'GITHUB_RATE_LIMITED',
  'GITHUB_SYNC_STALLED',
  'GITHUB_SYNC_FAILED',
])

/** Poll saved data only; never force an upstream refresh or retry a mutation. */
export function workflowRefreshInterval(error: Error | null): number | false {
  const details = error as (Error & { code?: string; retryAt?: string }) | null
  if (!details?.code || !refreshCodes.has(details.code)) return false
  const deadline = Date.parse(details.retryAt ?? '')
  if (!Number.isFinite(deadline)) return false
  return Math.min(2147483647, Math.max(1000, deadline - Date.now()))
}
