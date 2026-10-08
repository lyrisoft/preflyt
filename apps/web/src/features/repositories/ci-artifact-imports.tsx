import { useRef, useState } from 'react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'

export type ArtifactSummary = {
  id: string
  format: 'junit' | 'sarif'
  sha256: string
  parserVersion: number
  verification: string
  summary: Record<string, number | boolean | string>
  createdAt: string
}

export function CiArtifactImports({
  repositoryId,
  deliveryId,
  artifacts,
  canImport,
  onImported,
}: {
  repositoryId: string
  deliveryId: string
  artifacts: ArtifactSummary[]
  canImport: boolean
  onImported: () => Promise<unknown>
}) {
  const input = useRef<HTMLInputElement>(null)
  const format = useRef<'junit' | 'sarif'>('junit')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function upload(file: File) {
    setBusy(true)
    setMessage('')
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
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/ci-evidence/${encodeURIComponent(deliveryId)}/artifacts`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: format.current, content, sha256 }),
        }
      )
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? 'This observation already has ten reports.'
            : response.status === 400
              ? 'Report rejected. Check its format, counts and import limits.'
              : 'Import failed. Check your session and repository access.'
        )
      await onImported()
      setMessage('Report imported.')
    } catch (error) {
      setMessage(
        error instanceof TypeError
          ? 'Choose a valid UTF-8 report, or check your connection.'
          : error instanceof Error
            ? error.message
            : 'Import failed.'
      )
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }
  return (
    <div className='mt-3 space-y-2 text-xs'>
      {artifacts.map((artifact) => (
        <details key={artifact.id}>
          <summary className='cursor-pointer'>
            {artifact.format === 'junit' ? 'JUnit' : 'SARIF'} report · admin
            upload
          </summary>
          <div className='mt-2 space-y-1 break-all'>
            <p>Associated by an administrator. CI origin is unverified.</p>
            <p>SHA-256: {artifact.sha256}</p>
            <p>
              Parser v{artifact.parserVersion} ·{' '}
              {new Date(artifact.createdAt).toLocaleString()}
            </p>
            {Object.entries(artifact.summary).map(([key, value]) => (
              <p key={key}>
                {key}: {String(value)}
              </p>
            ))}
          </div>
        </details>
      ))}
      {canImport && (
        <>
          <p className='text-muted-foreground'>
            Upload a report for this exact CI observation. It does not establish
            a quality gate.
          </p>
          <input
            ref={input}
            type='file'
            hidden
            accept='.xml,.json,.sarif'
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
            }}
          />
          <div className='flex flex-wrap gap-2'>
            {(['junit', 'sarif'] as const).map((value) => (
              <Button
                key={value}
                type='button'
                size='sm'
                variant='outline'
                disabled={busy || artifacts.length >= 10}
                onClick={() => {
                  format.current = value
                  input.current?.click()
                }}
              >
                Import {value === 'junit' ? 'JUnit' : 'SARIF'}
              </Button>
            ))}
          </div>
        </>
      )}
      {busy && <p role='status'>Importing report…</p>}
      {message && <p role='status'>{message}</p>}
    </div>
  )
}
