import { ForbiddenException } from '@nestjs/common'

/** Accept only relative, same-origin paths; never redirect a sign-in off-site. */
export function loginReturnPath(raw?: string) {
  if (!raw) return '/overview'
  if (
    !raw.startsWith('/') ||
    raw.startsWith('//') ||
    /[\\\u0000-\u0020\u007f]/u.test(raw) ||
    /%0[ad]|%5c/i.test(raw) ||
    raw.length > 2048
  ) {
    throw new ForbiddenException('Invalid sign-in return path')
  }
  const parsed = new URL(raw, 'https://preflyt.invalid')
  if (
    parsed.origin !== 'https://preflyt.invalid' ||
    parsed.pathname.startsWith('//')
  ) {
    throw new ForbiddenException('Invalid sign-in return path')
  }
  return parsed.pathname + parsed.search + parsed.hash
}
