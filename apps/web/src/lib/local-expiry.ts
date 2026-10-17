/** Parse a datetime-local value without silently normalizing invalid dates or DST gaps. */
export function localExpiry(value: string, now = Date.now()) {
  if (!value) return { date: null, error: 'Choose a date and time.' }
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    value
  )
  const date = new Date(value)
  if (
    !parts ||
    !Number.isFinite(date.getTime()) ||
    date.getFullYear() !== Number(parts[1]) ||
    date.getMonth() + 1 !== Number(parts[2]) ||
    date.getDate() !== Number(parts[3]) ||
    date.getHours() !== Number(parts[4]) ||
    date.getMinutes() !== Number(parts[5]) ||
    date.getSeconds() !== Number(parts[6] ?? 0)
  ) {
    return { date: null, error: 'Choose a valid local date and time.' }
  }
  if (date.getTime() <= now)
    return { date: null, error: 'Choose a future date and time.' }
  return { date, error: null }
}
export function localExpiryDescription(date: Date) {
  const display = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'shortOffset',
  }).format(date)
  return `Reopens ${display} (${Intl.DateTimeFormat().resolvedOptions().timeZone}).`
}
