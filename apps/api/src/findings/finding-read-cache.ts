/** Bounded process-local projections. Database revisions and live scope are
 * checked on every read; this cache never grants access or verifies evidence. */
export class FindingReadCache {
  private readonly entries = new Map<string, { json: string; bytes: number; expires: number }>()
  private bytes = 0
  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    this.entries.delete(key)
    this.bytes -= entry.bytes
    if (entry.expires <= Date.now()) return undefined
    this.entries.set(key, entry)
    this.bytes += entry.bytes
    return JSON.parse(entry.json) as T
  }
  set(key: string, value: unknown) {
    const json = JSON.stringify(value),
      bytes = Buffer.byteLength(json)
    if (bytes > 8 * 1024 * 1024) return
    const old = this.entries.get(key)
    if (old) {
      this.entries.delete(key)
      this.bytes -= old.bytes
    }
    while (this.entries.size >= 16 || this.bytes + bytes > 32 * 1024 * 1024) {
      const first = this.entries.keys().next().value
      if (!first) break
      this.bytes -= this.entries.get(first)!.bytes
      this.entries.delete(first)
    }
    this.entries.set(key, { json, bytes, expires: Date.now() + 300000 })
    this.bytes += bytes
  }
}
