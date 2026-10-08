export function resolveWebOrigin() {
  const origin =
    process.env.WEB_ORIGIN ??
    (process.env.NODE_ENV !== 'production'
      ? 'http://localhost:5173'
      : undefined)
  if (!origin) throw new Error('WEB_ORIGIN is required in production')
  return new URL(origin).origin
}
