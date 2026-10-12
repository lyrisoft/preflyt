/** Untrusted sign-in query parameters may only identify an internal route. */
export function signInReturnPath(raw?: string): string {
  if (
    !raw ||
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    raw.includes('\\') ||
    Array.from(raw).some((character) => {
      const code = character.charCodeAt(0)
      return code <= 32 || code === 127
    }) ||
    /%0[ad]|%5c/i.test(raw) ||
    raw.length > 2048
  ) {
    return '/overview'
  }
  try {
    const parsed = new URL(raw, 'https://preflyt.invalid')
    return parsed.origin === 'https://preflyt.invalid' &&
      !parsed.pathname.startsWith('//')
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : '/overview'
  } catch {
    return '/overview'
  }
}

export function signInProviderHref(
  baseUrl: string,
  path: string,
  raw?: string
) {
  return raw
    ? `${baseUrl}${path}?${new URLSearchParams({ redirect: signInReturnPath(raw) })}`
    : `${baseUrl}${path}`
}
