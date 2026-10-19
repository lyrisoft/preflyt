const freshnessWindow = 60_000

/** Expired server timestamps must never become a rapid polling loop. */
export function freshnessTiming(
  checkedAt: string | null | undefined,
  receivedAt: number
) {
  const checked = checkedAt ? Date.parse(checkedAt) : NaN
  const remaining = Number.isFinite(checked)
    ? Math.max(
        0,
        Math.min(freshnessWindow, checked + freshnessWindow - receivedAt)
      )
    : 0
  return {
    staleTime: remaining,
    refetchInterval:
      remaining > 0 ? Math.max(5000, remaining) : freshnessWindow,
  }
}
