import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  decryptGitHubUserTokens,
  encryptGitHubUserTokens,
} from '../src/auth/github-token-cipher.js'
const tokens = {
  accessToken: 'fixture-access-token',
  refreshToken: 'fixture-refresh-token',
}
beforeEach(() =>
  vi.stubEnv(
    'GITHUB_USER_TOKEN_ENCRYPTION_KEY',
    randomBytes(32).toString('base64'),
  ),
)
afterEach(() => vi.unstubAllEnvs())
it('round-trips tokens with fresh nonces and no plaintext in storage', () => {
  const a = encryptGitHubUserTokens('account-a', tokens)
  const b = encryptGitHubUserTokens('account-a', tokens)
  expect(a).not.toEqual(b)
  expect(a).not.toContain(tokens.accessToken)
  expect(a).not.toContain(tokens.refreshToken)
  expect(decryptGitHubUserTokens('account-a', a)).toEqual(tokens)
})
it('rejects credentials copied to another account', () => {
  const envelope = encryptGitHubUserTokens('account-a', tokens)
  expect(() => decryptGitHubUserTokens('account-b', envelope)).toThrow(
    'could not be decrypted',
  )
})
it('rejects tampering, malformed data and unsupported versions without leaking secrets', () => {
  const envelope = encryptGitHubUserTokens('account-a', tokens)
  const parts = envelope.split('.')
  const changed = [...parts]
  changed[3] = (changed[3]!.startsWith('A') ? 'B' : 'A') + changed[3]!.slice(1)
  for (const value of [
    changed.join('.'),
    envelope.replace('v1.', 'v2.'),
    tokens.accessToken,
    'v1.a.b.c',
    'x'.repeat(24001),
  ]) {
    expect(() => decryptGitHubUserTokens('account-a', value)).toThrow(
      'GitHub user credentials could not be decrypted',
    )
  }
})
it('rejects a different encryption key', () => {
  const envelope = encryptGitHubUserTokens('account-a', tokens)
  vi.stubEnv(
    'GITHUB_USER_TOKEN_ENCRYPTION_KEY',
    randomBytes(32).toString('base64'),
  )
  expect(() => decryptGitHubUserTokens('account-a', envelope)).toThrow(
    'could not be decrypted',
  )
})
it.each([
  '',
  'short',
  Buffer.alloc(31).toString('base64'),
  Buffer.alloc(33).toString('base64'),
])('fails closed for an invalid key', (key) => {
  vi.stubEnv('GITHUB_USER_TOKEN_ENCRYPTION_KEY', key)
  expect(() => encryptGitHubUserTokens('account-a', tokens)).toThrow(
    '32-byte key',
  )
})
it('rejects empty account IDs and missing or oversized tokens', () => {
  expect(() => encryptGitHubUserTokens('', tokens)).toThrow(
    'Invalid GitHub account ID',
  )
  expect(() =>
    encryptGitHubUserTokens('a', { ...tokens, accessToken: '' }),
  ).toThrow('Invalid GitHub user tokens')
  expect(() =>
    encryptGitHubUserTokens('a', { ...tokens, refreshToken: 'x'.repeat(8193) }),
  ).toThrow('Invalid GitHub user tokens')
})

it('rejects token payloads that would exceed the stored envelope limit', () => {
  expect(() =>
    encryptGitHubUserTokens('a', {
      accessToken: '€'.repeat(8192),
      refreshToken: 'fixture',
    }),
  ).toThrow('Invalid GitHub user tokens')
})
