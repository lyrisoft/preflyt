import { useState, type ReactNode } from 'react'
import {
  ChevronRight,
  Layers,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { SurfaceIcon } from '@/components/surface-icon'
import { RelativeTime } from './relative-time'
import { useStandards, type Pack } from './repository-queries'
import { StandardsSelectionEditor } from './standards-selection-editor'

function SavedStandard({ pack }: { pack: Pack }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type='button'
          className='flex min-h-12 w-full items-center justify-between gap-3 border-b p-3 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring'
        >
          <span className='font-medium'>{pack.title}</span>
          <span className='flex shrink-0 items-center gap-2 text-xs text-muted-foreground'>
            v{pack.version} · {pack.rules.length}{' '}
            {pack.rules.length === 1 ? 'check' : 'checks'}
            {pack.aiChecks?.length
              ? ` · ${pack.aiChecks.length} AI Reviews`
              : ''}
            <ChevronRight className='size-4' aria-hidden='true' />
          </span>
        </button>
      </SheetTrigger>
      <SheetContent className='w-full gap-0 sm:max-w-xl'>
        <SheetHeader className='border-b p-4 pr-12'>
          <SheetTitle>{pack.title}</SheetTitle>
          <SheetDescription>
            v{pack.version} · {pack.rules.length}{' '}
            {pack.rules.length === 1 ? 'check' : 'checks'}
            {pack.aiChecks?.length
              ? ` · ${pack.aiChecks.length} AI Reviews`
              : ''}
          </SheetDescription>
        </SheetHeader>
        <div className='min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm'>
          <p className='text-muted-foreground'>{pack.description}</p>
          <ul className='space-y-2'>
            {pack.rules.map((rule) => (
              <li
                key={rule.id}
                className='flex flex-wrap justify-between gap-2'
              >
                <span>{rule.title}</span>
                <span className='text-xs text-muted-foreground'>
                  {rule.capability === 'available'
                    ? 'Configuration'
                    : rule.capability === 'import_only'
                      ? 'CI report'
                      : 'Planned'}
                </span>
              </li>
            ))}
          </ul>
          {!!pack.aiChecks?.length && (
            <ul className='space-y-2'>
              {pack.aiChecks.map((review) => (
                <li key={review.id}>
                  {review.title}{' '}
                  <span className='text-xs text-muted-foreground'>
                    Skill v{review.skillVersion} · suggestions only
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function RepositoryStandards({
  repositoryId,
  repositoryName = repositoryId,
  canManage,
  sourceBindings,
  policyRevisions,
}: {
  repositoryId: string
  repositoryName?: string
  canManage: boolean
  sourceBindings?: ReactNode | ((policyId?: string) => ReactNode)
  policyRevisions?: ReactNode
}) {
  const query = useStandards(repositoryId)
  const [editing, setEditing] = useState(false)
  const data = query.isError ? undefined : query.data
  const policyId = data?.selection?.policyId
  const policyBranch = data?.selection?.branchRef?.replace(/^refs\/heads\//, '')
  const saved =
    data?.selection?.packs
      .map((ref) =>
        data.catalogue.find(
          (pack) => pack.id === ref.id && pack.version === ref.version
        )
      )
      .filter((pack): pack is Pack => !!pack) ?? []
  const upgradesAvailable = data?.selection?.packs.some((ref) =>
    data.catalogue.some(
      (pack) =>
        pack.id === ref.id &&
        pack.version.localeCompare(ref.version, undefined, { numeric: true }) >
          0
    )
  )
  return (
    <div className='space-y-6'>
      <Card className='overflow-hidden'>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3'>
          <div className='flex min-w-0 items-center gap-3'>
            <SurfaceIcon icon={Layers} tone='teal' />
            <div className='min-w-0 space-y-1'>
              <CardTitle asChild>
                <h2>
                  {policyId
                    ? `${policyBranch} standards`
                    : 'Repository standards'}
                </h2>
              </CardTitle>
              <p className='text-xs text-muted-foreground'>
                {data?.selection
                  ? policyId
                    ? `From the published ${policyBranch} branch policy.`
                    : 'Saved requirements for this repository.'
                  : 'Choose the checks that matter for this repository.'}
              </p>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              variant='outline'
              size='icon'
              aria-label='Reload standards'
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw className='size-4' />
            </Button>
            {policyId && (
              <Button variant='outline' size='sm' asChild>
                <a
                  href={`/policies?repository=${encodeURIComponent(JSON.stringify(repositoryId))}&policy=${encodeURIComponent(JSON.stringify(policyId))}`}
                >
                  Review branch policy
                </a>
              </Button>
            )}
            {canManage && data && !policyId && (
              <Button size='sm' onClick={() => setEditing(true)}>
                <SlidersHorizontal className='size-4' />
                {data.selection ? 'Edit standards' : 'Choose standards'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {query.isPending ? (
            <div
              role='status'
              aria-label='Loading standards'
              className='space-y-3'
            >
              <Skeleton className='h-12 rounded-lg' />
              <Skeleton className='h-12 rounded-lg' />
            </div>
          ) : query.isError ? (
            <p role='alert' className='text-sm text-destructive'>
              {query.error.message}
            </p>
          ) : (
            data && (
              <>
                {!data.selectionIntegrity && (
                  <p
                    role='alert'
                    className='rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive'
                  >
                    Saved standard versions could not be verified. Save
                    supported versions again before evaluating checks.
                  </p>
                )}
                {data.selection ? (
                  <>
                    <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground'>
                      <span>
                        {data.selection.profile === 'DEFAULT'
                          ? 'Core'
                          : data.selection.profile === 'STRICT'
                            ? 'Strict'
                            : 'Recommended'}{' '}
                        requirements
                      </span>
                      <span>Revision {data.selection.revision}</span>
                      <span>
                        Saved <RelativeTime value={data.selection.createdAt} />
                      </span>
                    </div>
                    <div className='overflow-hidden rounded-lg border'>
                      {saved.map((pack) => (
                        <SavedStandard key={pack.id} pack={pack} />
                      ))}
                    </div>
                    {saved.length !== data.selection.packs.length && (
                      <p role='alert' className='text-sm text-destructive'>
                        Some saved standard versions are unavailable. Reload
                        before changing requirements.
                      </p>
                    )}
                    {upgradesAvailable && (
                      <p
                        role='status'
                        className='text-sm text-muted-foreground'
                      >
                        New standard versions are available.{' '}
                        {canManage
                          ? 'Use Edit standards to review them. Existing policies keep their saved version until you publish a new revision.'
                          : 'Ask a workspace administrator to review and adopt them.'}
                      </p>
                    )}
                  </>
                ) : (
                  <div className='space-y-2 py-3'>
                    <p className='text-sm font-medium'>No standards selected</p>
                    <p className='max-w-prose text-sm text-muted-foreground'>
                      {canManage
                        ? 'Start with the recommended standards, review the changes and save.'
                        : 'Ask a repository administrator to choose standards.'}
                    </p>
                  </div>
                )}
                <p className='text-xs text-muted-foreground'>
                  Saving standards does not enable GitHub merge protection.
                </p>
              </>
            )
          )}
        </CardContent>
      </Card>
      {data?.selection &&
        (typeof sourceBindings === 'function'
          ? sourceBindings(policyId)
          : sourceBindings)}
      {data?.selection && policyRevisions}
      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent className='w-full gap-0 sm:max-w-xl'>
          <SheetHeader className='border-b px-6 py-5'>
            <SheetTitle>
              {data?.selection
                ? 'Edit repository standards'
                : 'Choose repository standards'}
            </SheetTitle>
            <SheetDescription>
              Choose standards, review changes, then save. Existing policies
              keep their approved version.
            </SheetDescription>
          </SheetHeader>
          {data && canManage && !policyId && (
            <StandardsSelectionEditor
              key={data.selection?.id ?? 'new'}
              data={data}
              repositoryId={repositoryId}
              repositoryName={repositoryName}
              onSaved={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
