import { createHash } from 'node:crypto'
import type { RedisCacheService } from '../cache/redis-cache.service.js'

/** Revalidate using GitHub's validator. Never serves a body without a successful upstream response. */
export async function conditionalGitHubRead(cache: RedisCacheService | undefined, scope: string, url: string | URL, options: RequestInit,
  request: (options: RequestInit) => Promise<Response>): Promise<Response> {
  const headers = new Headers(options.headers)
  if (!cache || (options.method && options.method !== 'GET') || !scope.startsWith('installation:') || headers.has('if-none-match')) return request(options)
  // Credential digest preserves repository/permission scope without storing the credential.
  const key = 'github-conditional:v1:' + createHash('sha256').update(scope).update(String(url)).update(headers.get('authorization') ?? '').update(headers.get('accept') ?? '').digest('hex')
  let saved: {etag: string; body: string; headers: Record<string, string>} | undefined
  try { const raw = await cache.get(key); if (raw) { const value = JSON.parse(raw); if (typeof value.etag === 'string' && typeof value.body === 'string' && value.headers && typeof value.headers === 'object') saved = value } } catch { /* Missing validators require a full response. */ }
  if (saved) headers.set('if-none-match', saved.etag)
  const response = await request({...options, headers})
  if (response.status === 304 && saved) {
    const restored = new Headers(saved.headers)
    for (const [name, value] of response.headers) restored.set(name, value)
    restored.delete('content-length'); restored.delete('content-encoding')
    return new Response(saved.body, {status: 200, headers: restored})
  }
  if (!response.ok) { if ([401,403,404].includes(response.status)) await cache.delete(key); return response }
  const etag = response.headers.get('etag')
  if (!etag || etag.length > 500 || response.status !== 200) return response
  const reader = response.clone().body?.getReader()
  if (!reader) return response
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > 512 * 1024) { void reader.cancel(); return response }; chunks.push(chunk.value) }
    const body = Buffer.concat(chunks).toString('utf8')
    const metadata: Record<string,string> = {}
    for (const name of ['content-type', 'link']) { const value = response.headers.get(name); if (value) metadata[name] = value }
    await cache.set(key, JSON.stringify({etag, body, headers: metadata}), 3600)
  } catch { /* Caching must not turn a successful response into a failure. */ }
  return response
}
