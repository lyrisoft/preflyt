import type { UseQueryResult } from '@tanstack/react-query'
import { ExternalLink, FileCode2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { SurfaceIcon } from '@/components/surface-icon'
import type { FindingSource } from './finding-api'
import { FindingGuidance } from './finding-guidance'
import type { Finding } from './finding-types'
import { SourceCodeEditor } from './source-code-editor'

export function FindingSourceViewer({
  finding,
  source,
}: {
  finding: Finding
  source: UseQueryResult<FindingSource, Error>
}) {
  const data = source.isError ? undefined : source.data
  const valid =
    data?.sourceSha === finding.sourceSha && data?.path === finding.path
  const github =
    finding.path && /^[a-f0-9]{40}$/.test(finding.sourceSha)
      ? `https://github.com/${finding.repository}/blob/${finding.sourceSha}/${finding.path.split('/').map(encodeURIComponent).join('/')}${finding.line ? `#L${finding.line}${finding.endLine && finding.endLine > finding.line ? `-L${finding.endLine}` : ''}` : ''}`
      : null
  return (
    <Card
      className='min-w-0 gap-0 overflow-hidden py-0'
      aria-label='Affected code'
    >
      <CardHeader className='flex flex-wrap items-center justify-between gap-3 border-b p-4'>
        <div className='flex min-w-0 items-center gap-3'>
          <SurfaceIcon icon={FileCode2} tone='blue' size='sm' />
          <div className='min-w-0'>
            <CardTitle className='text-base'>Affected code</CardTitle>
            <p className='mt-1 text-xs wrap-anywhere text-muted-foreground'>
              {finding.path ?? 'No source location supplied'}
            </p>
          </div>
        </div>
        {github && (
          <Button variant='outline' size='sm' asChild>
            <a href={github} target='_blank' rel='noreferrer'>
              Open on GitHub <ExternalLink />
            </a>
          </Button>
        )}
      </CardHeader>
      {!!finding.relatedLocations?.length &&
        /^[a-f0-9]{40}$/.test(finding.sourceSha) && (
          <div className='space-y-2 border-b p-4'>
            <h3 className='text-sm font-medium'>
              {finding.category === 'duplication'
                ? 'Matching blocks'
                : 'Related locations'}
            </h3>
            <p className='text-xs text-muted-foreground'>
              Reported locations at this commit · up to 3 retained links.
            </p>
            <ul className='space-y-1 text-sm'>
              {finding.relatedLocations.map((location) => (
                <li
                  key={`${location.path}:${location.line}:${location.endLine}`}
                >
                  <a
                    className='break-all underline underline-offset-4'
                    target='_blank'
                    rel='noreferrer'
                    href={`https://github.com/${finding.repository}/blob/${finding.sourceSha}/${location.path.split('/').map(encodeURIComponent).join('/')}#L${location.line}-L${location.endLine}`}
                  >
                    {location.path}:{location.line}–{location.endLine}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      {source.isPending ? (
        <div
          role='status'
          aria-label='Loading assessed source code'
          aria-busy='true'
        >
          <span className='sr-only'>Loading assessed source code</span>
          <div aria-hidden='true' className='flex bg-muted/10'>
            <div className='flex w-11 shrink-0 flex-col gap-3 border-r bg-muted/20 px-3 py-4'>
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton
                  key={index}
                  className='h-3 w-full rounded-sm motion-reduce:animate-none'
                />
              ))}
            </div>
            <div className='flex min-w-0 flex-1 flex-col gap-3 px-4 py-4'>
              {['62%', '80%', '48%', '72%', '36%', '84%', '56%', '40%'].map(
                (width, index) => (
                  <Skeleton
                    key={index}
                    style={{ width }}
                    className='h-3 rounded-sm motion-reduce:animate-none'
                  />
                )
              )}
            </div>
          </div>
          <div
            aria-hidden='true'
            className='flex justify-between border-t bg-muted/20 px-4 py-3'
          >
            <Skeleton className='h-3 w-14 motion-reduce:animate-none' />
            <Skeleton className='h-3 w-32 motion-reduce:animate-none' />
          </div>
        </div>
      ) : source.isError ? (
        <CardContent className='space-y-3 p-5'>
          <p role='alert' className='text-sm'>
            {source.error.message}
          </p>
          <Button
            variant='outline'
            size='sm'
            onClick={() => void source.refetch()}
          >
            <RefreshCw />
            Retry source
          </Button>
        </CardContent>
      ) : !valid ? (
        <CardContent className='p-5'>
          <p role='alert' className='text-sm'>
            Source could not be matched to this finding’s file and commit.
          </p>
        </CardContent>
      ) : data?.reason ? (
        <CardContent className='space-y-3 p-5'>
          <p className='text-sm leading-relaxed'>{data.reason}</p>
          {data.retryable && (
            <Button
              variant='outline'
              size='sm'
              disabled={source.isFetching}
              onClick={() => void source.refetch()}
            >
              <RefreshCw /> Retry source
            </Button>
          )}
        </CardContent>
      ) : (
        <>
          <SourceCodeEditor
            finding={finding}
            lines={data?.lines ?? []}
            path={finding.path ?? ''}
            reportedLine={finding.line}
            reportedEndLine={finding.endLine}
          />
          <div className='space-y-1 border-t px-4 py-3 text-xs text-muted-foreground'>
            <p>
              Source at commit <code>{finding.sourceSha.slice(0, 12)}</code>
              {finding.line
                ? ` · Reported ${finding.endLine && finding.endLine !== finding.line ? `lines ${finding.line}–${finding.endLine}` : `line ${finding.line}`}`
                : ' · No line was supplied; no code is highlighted.'}
            </p>
            {data?.truncated && (
              <p>
                The excerpt is limited. Open the file on GitHub for more
                context.
              </p>
            )}
          </div>
        </>
      )}
      <FindingGuidance finding={finding} />
    </Card>
  )
}
