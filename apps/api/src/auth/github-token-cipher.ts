import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export type GitHubUserTokens = { accessToken: string; refreshToken: string }

// Lazy configuration: existing OIDC and Super Admin deployments need no new key.
// The future GitHub login must validate this configuration before it is enabled.
function encryptionKey() {
  const encoded = process.env.GITHUB_USER_TOKEN_ENCRYPTION_KEY
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded))
    throw new Error(
      'GITHUB_USER_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    )
  const key = Buffer.from(encoded, 'base64')
  if (key.length !== 32 || key.toString('base64') !== encoded)
    throw new Error(
      'GITHUB_USER_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key',
    )
  return key
}

function context(accountId: string) {
  if (!accountId || accountId.length > 256)
    throw new Error('Invalid GitHub account ID')
  return Buffer.from(`preflyt:github-user-tokens:v1:${accountId}`)
}

function validTokens(value: unknown): value is GitHubUserTokens {
  if (!value || typeof value !== 'object') return false
  const tokens = value as Record<string, unknown>
  return (
    Object.keys(tokens).length === 2 &&
    typeof tokens.accessToken === 'string' &&
    tokens.accessToken.length > 0 &&
    tokens.accessToken.length <= 8192 &&
    typeof tokens.refreshToken === 'string' &&
    tokens.refreshToken.length > 0 &&
    tokens.refreshToken.length <= 8192 &&
    Buffer.byteLength(JSON.stringify(tokens), 'utf8') <= 16000
  )
}

export function encryptGitHubUserTokens(
  accountId: string,
  tokens: GitHubUserTokens,
) {
  if (!validTokens(tokens)) throw new Error('Invalid GitHub user tokens')
  const nonce = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), nonce)
  cipher.setAAD(context(accountId))
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(tokens), 'utf8'),
    cipher.final(),
  ])
  return [
    'v1',
    nonce.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

export function decryptGitHubUserTokens(
  accountId: string,
  envelope: string,
): GitHubUserTokens {
  const key = encryptionKey()
  const aad = context(accountId)
  try {
    if (envelope.length > 24000) throw new Error()
    const parts = envelope.split('.')
    if (
      parts.length !== 4 ||
      parts[0] !== 'v1' ||
      parts.slice(1).some((part) => !/^[A-Za-z0-9_-]+$/.test(part))
    )
      throw new Error()
    const nonce = Buffer.from(parts[1]!, 'base64url')
    const tag = Buffer.from(parts[2]!, 'base64url')
    if (nonce.length !== 12 || tag.length !== 16) throw new Error()
    const cipher = createDecipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(aad)
    cipher.setAuthTag(tag)
    const plaintext = Buffer.concat([
      cipher.update(Buffer.from(parts[3]!, 'base64url')),
      cipher.final(),
    ])
    const tokens: unknown = JSON.parse(plaintext.toString('utf8'))
    if (!validTokens(tokens)) throw new Error()
    return tokens
  } catch {
    // Never include ciphertext, key, tokens or parser errors in logs/errors.
    throw new Error('GitHub user credentials could not be decrypted')
  }
}
