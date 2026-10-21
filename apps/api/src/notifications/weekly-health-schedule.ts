/** Calendar arithmetic happens in the member's timezone, including DST changes. */
function local(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (key: string) => Number(parts.find((p) => p.type === key)!.value);
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}
function utc(wall: number, timezone: string) {
  let value = wall;
  const seen = new Set<number>();
  for (let i = 0; i < 8; i++) {
    const next = value + wall - local(new Date(value), timezone);
    if (next === value) return new Date(value);
    // A skipped local hour oscillates between the times on either side of
    // the DST gap. Deliver after the gap rather than before the chosen hour.
    if (seen.has(next)) return new Date(Math.max(value, next));
    seen.add(value);
    value = next;
  }
  return new Date(value);
}
export function weeklyHealthPeriod(
  now: Date,
  day: number,
  hour: number,
  timezone: string,
) {
  const wall = local(now, timezone),
    date = new Date(wall);
  let due =
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
    ) -
    ((date.getUTCDay() - day + 7) % 7) * 86400000;
  if (due > wall) due -= 7 * 86400000;
  const dueDay = new Date(due).getUTCDay();
  const monday = new Date(due - ((dueDay + 6) % 7) * 86400000)
    .toISOString()
    .slice(0, 10);
  return {
    week: monday,
    cutoff: utc(due, timezone),
    periodStart: utc(due - 7 * 86400000, timezone),
  };
}
