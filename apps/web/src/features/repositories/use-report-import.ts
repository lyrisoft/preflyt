import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { API_BASE_URL } from '@/lib/api'

type Format = 'junit' | 'sarif'

/**
 * Report import for one CI observation at a time, through a single hidden
 * file input shared by every row.
 */
export function useReportImport({
  repositoryId,
  onImported,
}: {
  repositoryId: string
  onImported: () => Promise<unknown>
}) {
  const input = useRef<HTMLInputElement>(null)
  const target = useRef<{ deliveryId: string; format: Format } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function upload(file: File) {
    const current = target.current
    if (!current) return
    setBusy(current.deliveryId)
    try {
      if (!file.size || file.size > 256 * 1024)
        throw new Error('Choose a UTF-8 report up to 256 KiB.')
      const bytes = await file.arrayBuffer()
      const content = new TextDecoder('utf-8', {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes)
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      const sha256 = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0')
      ).join('')
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/ci-evidence/${encodeURIComponent(current.deliveryId)}/artifacts`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: current.format, content, sha256 }),
        }
      )
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'This CI result already has ten reports.'
            : response.status === 400
              ? 'Report rejected. Check its format, counts and import limits.'
              : 'Import failed. Check your session and repository access.'
        )
      await onImported()
      toast.success(
        `${current.format === 'junit' ? 'JUnit' : 'SARIF'} report imported.`
      )
    } catch (error) {
      toast.error(
        error instanceof TypeError
          ? 'Choose a valid UTF-8 report, or check your connection.'
          : error instanceof Error
            ? error.message
            : 'Import failed.'
      )
    } finally {
      setBusy(null)
      target.current = null
      if (input.current) input.current.value = ''
    }
  }

  return {
    busy,
    choose(deliveryId: string, format: Format) {
      target.current = { deliveryId, format }
      input.current?.click()
    },
    inputProps: {
      ref: input,
      type: 'file',
      hidden: true,
      accept: '.xml,.json,.sarif',
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0]
        if (file) void upload(file)
      },
    } as const,
  }
}
