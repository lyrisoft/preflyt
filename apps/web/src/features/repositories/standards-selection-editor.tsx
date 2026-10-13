import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SheetFooter } from '@/components/ui/sheet'
import { governanceRequest } from './governance-api'
import type { Selection, Standards } from './repository-queries'
import {
  selectionBody,
  selectionChanges,
  standardGroups,
} from './standards-selection'

export function StandardsSelectionEditor({
  data,
  repositoryId,
  repositoryName,
  onSaved,
  onCancel,
}: {
  data: Standards
  repositoryId: string
  repositoryName: string
  onSaved: () => void
  onCancel: () => void
}) {
  const client = useQueryClient()
  const [profile, setProfile] = useState(
    data.selection?.profile ?? 'RECOMMENDED'
  )
  const [selected, setSelected] = useState(
    data.selection?.packs ??
      data.recommendations.map(({ id, version }) => ({ id, version }))
  )
  const [reviewing, setReviewing] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const changes = selectionChanges(data, selected, profile)
  const groups = standardGroups(data.catalogue).filter(([pack]) =>
    `${pack.title} ${pack.description}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  const mutation = useMutation({
    mutationFn: () =>
      governanceRequest<Selection>(
        `/github/repositories/${encodeURIComponent(repositoryId)}/standards`,
        selectionBody(data, selected, profile)
      ),
    meta: { successMessage: 'Repository standards saved' },
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: ['repository-standards', repositoryId],
        }),
        client.invalidateQueries({ queryKey: ['gate-policies', repositoryId] }),
      ])
      onSaved()
    },
  })
  const valid =
    selected.length > 0 &&
    selected.length <= 5 &&
    changes.packs.length === selected.length
  return (
    <>
      <div className='min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-4'>
        <p className='text-sm text-muted-foreground'>
          Repository:{' '}
          <span className='font-medium text-foreground'>{repositoryName}</span>
        </p>
        {reviewing ? (
          <section aria-label='Review standards changes' className='space-y-5'>
            <h3 className='text-base font-semibold'>Review changes</h3>
            <ul className='divide-y rounded-lg border'>
              {changes.packs.map((pack) => (
                <li
                  key={pack.id}
                  className='flex flex-wrap justify-between gap-2 p-3 text-sm'
                >
                  <span className='font-medium'>{pack.title}</span>
                  <span className='text-muted-foreground'>v{pack.version}</span>
                </li>
              ))}
            </ul>
            <p className='text-sm'>
              {profile === 'DEFAULT'
                ? 'Core'
                : profile === 'STRICT'
                  ? 'Strict'
                  : 'Recommended'}{' '}
              requirements: {changes.required.length} required{' '}
              {changes.required.length === 1 ? 'check' : 'checks'},{' '}
              {changes.rules.length - changes.required.length} optional checks.
            </p>
            <div className='space-y-2 text-sm'>
              <p>
                {changes.added.length} additional required{' '}
                {changes.added.length === 1 ? 'check' : 'checks'}
                {changes.added.length
                  ? `: ${changes.added.map((r) => r.title).join(', ')}`
                  : '.'}
              </p>
              {!!changes.changedVersions.length && (
                <p>
                  {changes.changedVersions.length} standard versions will
                  change. Existing assessments keep their saved versions.
                </p>
              )}
              {!!changes.removedStandards.length && (
                <p className='text-warning'>
                  {changes.removedStandards.length} standards will be removed
                  from this repository selection.
                </p>
              )}
              {!!changes.removed.length && (
                <p className='text-warning'>
                  No longer required by this selection:{' '}
                  {changes.removed.map((r) => r.title).join(', ')}. Inherited
                  team requirements cannot be removed here.
                </p>
              )}
            </div>
            <p className='rounded-lg border bg-muted/20 p-3 text-sm'>
              Saving updates repository requirements. Published branch policies
              need a new revision before using these changes. GitHub merge
              protection stays unchanged.
            </p>
            <p className='text-xs text-muted-foreground'>
              Preflyt validates the saved versions, current selection and
              inherited requirements when you save. This preview does not run
              checks.
            </p>
          </section>
        ) : (
          <>
            <fieldset className='space-y-3'>
              <legend className='text-sm font-semibold'>
                Choose standards{' '}
                <span className='font-normal text-muted-foreground'>
                  ({selected.length} of 5 selected)
                </span>
              </legend>
              <Input
                aria-label='Search available standards'
                placeholder='Search standards…'
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
              <div className='divide-y rounded-lg border'>
                {groups.slice((page - 1) * 8, page * 8).map((versions) => {
                  const ref = selected.find((r) => r.id === versions[0].id)
                  const pack =
                    versions.find((p) => p.version === ref?.version) ??
                    versions[0]
                  return (
                    <div key={pack.id} className='space-y-2 p-3'>
                      <label className='flex cursor-pointer items-start gap-3 text-sm'>
                        <Checkbox
                          className='mt-0.5'
                          checked={!!ref}
                          onCheckedChange={(checked) =>
                            setSelected((refs) =>
                              checked === true
                                ? [
                                    ...refs.filter((r) => r.id !== pack.id),
                                    { id: pack.id, version: pack.version },
                                  ]
                                : refs.filter((r) => r.id !== pack.id)
                            )
                          }
                        />
                        <span className='min-w-0'>
                          <span className='font-medium'>{pack.title}</span>
                          <span className='mt-1 block text-xs text-muted-foreground'>
                            {pack.description}
                          </span>
                        </span>
                      </label>
                      {!!ref && (
                        <div className='pl-7'>
                          <Select
                            value={ref.version}
                            onValueChange={(version) =>
                              setSelected((refs) =>
                                refs.map((r) =>
                                  r.id === pack.id
                                    ? { id: pack.id, version }
                                    : r
                                )
                              )
                            }
                          >
                            <SelectTrigger
                              aria-label={`${pack.title} version`}
                              className='w-full'
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {versions.map((p, index) => (
                                <SelectItem key={p.version} value={p.version}>
                                  v{p.version}
                                  {index === 0 ? ' (latest)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )
                })}
                {!groups.length && (
                  <p className='p-4 text-sm text-muted-foreground'>
                    No matching standards.
                  </p>
                )}
              </div>
              {groups.length > 8 && (
                <nav
                  aria-label='Available standards pages'
                  className='flex items-center justify-end gap-2'
                >
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </Button>
                  <span className='text-xs text-muted-foreground'>
                    {page} / {Math.ceil(groups.length / 8)}
                  </span>
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={page * 8 >= groups.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </fieldset>
            <details className='rounded-lg border p-3'>
              <summary className='cursor-pointer text-sm font-medium'>
                Requirement level:{' '}
                {profile === 'DEFAULT'
                  ? 'Core'
                  : profile === 'STRICT'
                    ? 'Strict'
                    : 'Recommended'}
              </summary>
              <div className='mt-3 space-y-2'>
                <Select value={profile} onValueChange={setProfile}>
                  <SelectTrigger
                    aria-label='Requirement level'
                    className='w-full'
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.adoptionProfiles.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value === 'DEFAULT'
                          ? 'Core'
                          : value === 'STRICT'
                            ? 'Strict'
                            : 'Recommended'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className='text-xs text-muted-foreground'>
                  Core uses baseline requirements. Recommended adds broader
                  checks. Strict also requires resilience checks.
                </p>
              </div>
            </details>
            {selected.length > 5 && (
              <p role='alert' className='text-sm text-warning'>
                Choose up to five standards.
              </p>
            )}
          </>
        )}
        {mutation.isError && (
          <p role='alert' className='text-sm text-destructive'>
            {mutation.error.message}
          </p>
        )}
      </div>
      <SheetFooter className='flex-row flex-wrap justify-end border-t px-6 py-4'>
        <Button
          variant='outline'
          disabled={mutation.isPending}
          onClick={
            reviewing
              ? () => {
                  setReviewing(false)
                  mutation.reset()
                }
              : onCancel
          }
        >
          {reviewing ? 'Back' : 'Cancel'}
        </Button>
        <Button
          disabled={mutation.isPending || !valid}
          onClick={() => (reviewing ? mutation.mutate() : setReviewing(true))}
        >
          {mutation.isPending
            ? 'Saving…'
            : reviewing
              ? 'Save standards'
              : 'Review changes'}
        </Button>
      </SheetFooter>
    </>
  )
}
