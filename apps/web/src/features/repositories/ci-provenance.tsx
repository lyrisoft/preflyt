import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { engineeringPath } from './engineering-queries'

type Proof = {
  configured: boolean
  provenance: null | {
    signerWorkflow: string
    runId: string
    runAttempt: number
    receiptHash: string
  }
  executionTrusted: boolean
}

export function CiProvenance({
  repositoryId,
  deliveryId,
  artifactId,
  canVerify,
}: {
  repositoryId: string
  deliveryId: string
  artifactId: string
  canVerify: boolean
}) {
  const [open, setOpen] = useState(false)
  const [signerWorkflow, setSigner] = useState('')
  const [bundle, setBundle] = useState('')
  const [fileError, setFileError] = useState('')
  const path = engineeringPath(
    repositoryId,
    `/ci-evidence/${encodeURIComponent(deliveryId)}/artifacts/${encodeURIComponent(artifactId)}/provenance`
  )
  const client = useQueryClient()
  const key = ['ci-provenance', repositoryId, deliveryId, artifactId, path]
  const query = useQuery<Proof>({
    queryKey: key,
    enabled: open,
    retry: false,
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await fetch(path, { credentials: 'include', signal })
      if (!result.ok)
        throw new Error(
          'Could not load report source verification. Check the report and your repository access.'
        )
      return result.json() as Promise<Proof>
    },
  })
  const mutation = useMutation({
    mutationFn: async () => {
      const result = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bundle, signerWorkflow }),
      })
      if (!result.ok)
        throw new Error(
          result.status === 503
            ? 'Verification is not configured on this deployment.'
            : result.status === 429
              ? 'Verification is busy or the report proof limit was reached. Retry later.'
              : 'Proof rejected. Check the signed report hash, repository, commit, approved workflow and run attempt.'
        )
    },
    onSuccess: async () => {
      setBundle('')
      await client.invalidateQueries({ queryKey: key })
    },
  })
  return (
    <div className='space-y-2 text-xs'>
      <Button
        variant='ghost'
        size='sm'
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        Report source verification
      </Button>
      {open && (
        <div className='space-y-3 rounded-md border p-3'>
          {query.isPending ? (
            <p role='status'>Loading report verification…</p>
          ) : query.isError ? (
            <p role='alert'>{query.error.message}</p>
          ) : (
            <>
              <p>
                {query.data.provenance
                  ? 'The report’s signed source was verified.'
                  : 'No valid signed proof of the report’s source is available.'}{' '}
                Preflyt has not verified which tools ran or which rules they
                checked.
              </p>
              {query.data.provenance && (
                <p className='break-all'>
                  {query.data.provenance.signerWorkflow} · run{' '}
                  {query.data.provenance.runId}, attempt{' '}
                  {query.data.provenance.runAttempt}
                  <code className='block'>
                    {query.data.provenance.receiptHash}
                  </code>
                </p>
              )}
              {!query.data.configured && (
                <p>
                  Ask your administrator to configure the signature verification
                  tool, trusted certificates and approved signing workflows.
                </p>
              )}
              {canVerify && query.data.configured && (
                <form
                  className='space-y-2'
                  onSubmit={(event) => {
                    event.preventDefault()
                    mutation.mutate()
                  }}
                >
                  <label className='block'>
                    Approved signer workflow
                    <Input
                      value={signerWorkflow}
                      maxLength={256}
                      onChange={(e) => setSigner(e.target.value)}
                      placeholder='owner/repo/.github/workflows/ci.yml'
                      required
                      disabled={mutation.isPending}
                    />
                  </label>
                  <label className='block'>
                    Signed Sigstore bundle (JSON, up to 512 KiB)
                    <Input
                      type='file'
                      accept='.json,.jsonl'
                      disabled={mutation.isPending}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        setBundle('')
                        setFileError('')
                        mutation.reset()
                        if (!file) return
                        if (!file.size || file.size > 512 * 1024) {
                          setFileError(
                            'Choose one signed JSON bundle up to 512 KiB.'
                          )
                          return
                        }
                        try {
                          const text = new TextDecoder('utf-8', {
                            fatal: true,
                          }).decode(await file.arrayBuffer())
                          JSON.parse(text)
                          setBundle(text)
                        } catch {
                          setFileError('Choose a valid UTF-8 JSON bundle.')
                        }
                      }}
                    />
                  </label>
                  {fileError && <p role='alert'>{fileError}</p>}
                  {mutation.isError && (
                    <p role='alert'>{mutation.error.message}</p>
                  )}
                  {mutation.isSuccess && (
                    <p role='status'>
                      Report source verified. Create a new assessment to include
                      this proof.
                    </p>
                  )}
                  <Button
                    size='sm'
                    type='submit'
                    disabled={!bundle || mutation.isPending}
                  >
                    {mutation.isPending ? 'Verifying…' : 'Verify report source'}
                  </Button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
