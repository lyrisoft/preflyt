import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CiArtifactImports, type ArtifactSummary } from './ci-artifact-imports'

type Observation = {
  artifacts: ArtifactSummary[]
  sourceAction: string
  deliveryId: string
  version: number
  sourceSha: string
  sourceKind: string
  sourceObjectId: string
  sourceStatus: string | null
  sourceConclusion: string | null
  sourceUpdatedAt: string | null
  result: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'NOT_EXECUTED' | 'UNKNOWN'
  sourcePayloadHash: string
  evidenceHash: string
  observedAt: string
}
type Evidence = { enabled: boolean; observations: Observation[] }
const labels = {
  SUCCEEDED: 'Provider succeeded',
  FAILED: 'Provider failed',
  PENDING: 'Pending',
  NOT_EXECUTED: 'Not executed',
  UNKNOWN: 'Unknown',
}

export function RepositoryCiEvidence({
  repositoryId,
  canImport,
}: {
  repositoryId: string
  canImport: boolean
}) {
  const [draft, setDraft] = useState('')
  const [sha, setSha] = useState('')
  const valid = draft === '' || /^[a-f0-9]{40}$/i.test(draft)
  const query = useQuery<Evidence>({
    queryKey: ['ci-evidence', repositoryId, sha],
    retry: false,
    refetchInterval: (query) => (query.state.data?.enabled ? 10_000 : false),
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/ci-evidence${sha ? `?sha=${encodeURIComponent(sha)}` : ''}`,
        { credentials: 'include', signal }
      )
      if (!response.ok)
        throw new Error(
          response.status === 403
            ? 'Repository selection or access changed. Reload the profile.'
            : 'Could not load CI evidence. Try again.'
        )
      return response.json() as Promise<Evidence>
    },
  })
  return (
    <Card className='mb-6'>
      <CardHeader className='flex flex-row items-start justify-between gap-4'>
        <div>
          <CardTitle>Imported CI evidence</CardTitle>
          <CardDescription className='mt-2'>
            GitHub-reported observations at exact commits. Preflyt has not
            evaluated a quality gate.
          </CardDescription>
        </div>
        <Button
          variant='outline'
          size='icon'
          aria-label='Refresh CI evidence'
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw className={query.isFetching ? 'animate-spin' : ''} />
        </Button>
      </CardHeader>
      <CardContent>
        <form
          className='mb-4 flex flex-wrap items-end gap-2'
          onSubmit={(event) => {
            event.preventDefault()
            if (valid) setSha(draft.toLowerCase())
          }}
        >
          <div className='min-w-0 flex-1'>
            <label
              htmlFor='ci-evidence-sha'
              className='mb-2 block text-sm font-medium'
            >
              Commit filter
            </label>
            <Input
              id='ci-evidence-sha'
              value={draft}
              maxLength={40}
              placeholder='Full commit SHA, or leave empty for history'
              aria-invalid={!valid}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <Button type='submit' variant='outline' disabled={!valid}>
            Apply filter
          </Button>
        </form>
        {!valid && (
          <p className='mb-3 text-sm text-destructive'>
            Enter all 40 characters of a commit SHA.
          </p>
        )}
        {query.isPending ? (
          <p role='status' className='text-sm text-muted-foreground'>
            Loading CI evidence…
          </p>
        ) : query.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {query.error.message}
          </p>
        ) : (
          <>
            {!query.data.enabled && (
              <p className='mb-3 text-sm text-muted-foreground'>
                GitHub event collection is not configured.
              </p>
            )}
            {query.data.observations.length === 0 ? (
              <p className='text-sm text-muted-foreground'>
                No imported CI evidence{sha ? ' for this commit' : ''}. Evidence
                appears after the worker processes new check or workflow events.
              </p>
            ) : (
              <>
                <p className='mb-3 text-xs text-muted-foreground'>
                  Latest 50 received observations. Reruns and late deliveries
                  remain separate history; these rows do not establish current
                  PR readiness.
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Commit</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead>Provenance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {query.data.observations.map((item) => (
                      <TableRow key={item.deliveryId}>
                        <TableCell className='whitespace-nowrap'>
                          {item.sourceKind === 'check_run'
                            ? 'Check'
                            : 'Workflow'}{' '}
                          #{item.sourceObjectId}
                        </TableCell>
                        <TableCell>
                          <code title={item.sourceSha} className='text-xs'>
                            {item.sourceSha.slice(0, 12)}
                          </code>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.result === 'FAILED'
                                ? 'destructive'
                                : 'secondary'
                            }
                          >
                            {labels[item.result]}
                          </Badge>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {item.sourceStatus ?? 'unknown'} ·{' '}
                            {item.sourceConclusion ?? 'no conclusion'}
                          </p>
                        </TableCell>
                        <TableCell className='text-xs whitespace-nowrap'>
                          {new Date(item.observedAt).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <details className='max-w-64 text-xs'>
                            <summary className='cursor-pointer'>
                              Signed delivery
                            </summary>
                            <dl className='mt-2 space-y-1 break-all'>
                              <dt>Delivery</dt>
                              <dd>{item.deliveryId}</dd>
                              <dt>Commit</dt>
                              <dd>{item.sourceSha}</dd>
                              <dt>Evidence SHA-256 (v{item.version})</dt>
                              <dd>{item.evidenceHash}</dd>
                              <dt>Signed delivery digest</dt>
                              <dd>{item.sourcePayloadHash}</dd>
                              <dt>Provider timestamp</dt>
                              <dd>
                                {item.sourceUpdatedAt
                                  ? new Date(
                                      item.sourceUpdatedAt
                                    ).toLocaleString()
                                  : 'Not reported'}
                              </dd>
                            </dl>
                          </details>
                          <CiArtifactImports
                            repositoryId={repositoryId}
                            deliveryId={item.deliveryId}
                            artifacts={item.artifacts}
                            canImport={
                              canImport &&
                              item.sourceStatus === 'completed' &&
                              item.sourceAction === 'completed'
                            }
                            onImported={() => query.refetch()}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
