import { useEffect, useState } from 'react'
import { freshnessTiming } from './freshness-timing'

// Invalidation means "refetch", not "the last branch comparison has expired".
// Track the actual deadline so background work cannot toggle a valid badge.
export function useFreshnessExpired(checkedAt: string | null | undefined) {
  const deadline = checkedAt ? Date.parse(checkedAt) + 60000 : null
  const [expiredDeadline, setExpiredDeadline] = useState<number | null>(null)
  useEffect(() => {
    if (deadline === null || !Number.isFinite(deadline)) return
    const timer = window.setTimeout(
      () => setExpiredDeadline(deadline),
      freshnessTiming(checkedAt, Date.now()).staleTime
    )
    return () => window.clearTimeout(timer)
  }, [checkedAt, deadline])
  return deadline !== null && expiredDeadline === deadline
}
