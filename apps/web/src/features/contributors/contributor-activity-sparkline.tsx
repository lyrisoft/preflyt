export function ContributorActivitySparkline({
  login,
  activity,
  partial = false,
}: {
  login: string
  activity?: { date: string; count: number }[] | null
  partial?: boolean
}) {
  if (!activity?.length)
    return (
      <span
        className='text-muted-foreground'
        aria-label={`Activity for ${login} is unavailable`}
      >
        —
      </span>
    )
  const width = 144,
    height = 36,
    pad = 3,
    max = Math.max(1, ...activity.map((d) => d.count)),
    total = activity.reduce((n, d) => n + d.count, 0)
  const points = activity
    .map(
      (d, i) =>
        `${pad + (i / Math.max(1, activity.length - 1)) * (width - pad * 2)},${height - pad - (d.count / max) * (height - pad * 2)}`
    )
    .join(' ')
  const label = `${login}: ${total} recorded participations, ${activity[0].date} to ${activity[activity.length - 1].date} UTC${partial ? ' (partial records)' : ''}`
  return (
    <svg
      role='img'
      aria-label={label}
      viewBox={`0 0 ${width} ${height}`}
      className={`h-9 w-36 ${total ? 'text-success-text' : 'text-muted-foreground'}`}
    >
      <title>{label}</title>
      <polyline
        points={points}
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </svg>
  )
}
