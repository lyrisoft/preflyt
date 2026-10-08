import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Rule = {
  id: string
  title: string
  capability: string
  guidance: string
  requiredIn: string[]
}
type Pack = {
  id: string
  version: string
  digest: string
  title: string
  description: string
  stages: string[]
  rules: Rule[]
}
type Selection = {
  id: string
  revision: number
  profile: string
  packs: { id: string; version: string }[]
  sourceSha: string | null
  createdAt: string
}
type Standards = {
  selectionIntegrity: boolean
  catalogue: Pack[]
  adoptionProfiles: string[]
  selection: Selection | null
  recommendations: { id: string; version: string; reason: string }[]
  profileSnapshot: { sourceSha: string; complete: boolean } | null
  controls: {
    id: string
    title: string
    required: boolean
    capability: string
    configuration: string
    reason: string
    evidence: { path: string; blobSha: string }[]
  }[]
}
function SelectionEditor({
  data,
  repositoryId,
}: {
  data: Standards
  repositoryId: string
}) {
  const client = useQueryClient()
  const [profile, setProfile] = useState(
    data.selection?.profile ?? 'RECOMMENDED'
  )
  const [selected, setSelected] = useState(
    data.selection?.packs ??
      data.recommendations.map(({ id, version }) => ({ id, version }))
  )
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/standards`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile,
            packs: selected,
            expectedSelectionId: data.selection?.id ?? null,
          }),
        }
      )
      if (!response.ok)
        throw new Error(
          response.status === 409
            ? 'Selection changed. Reload before saving.'
            : 'Could not save standards. Check your session and repository access.'
        )
      return response.json() as Promise<Selection>
    },
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: ['repository-standards', repositoryId],
      }),
  })
  return (
    <div className='space-y-4'>
      <label className='block max-w-xs space-y-2 text-sm'>
        <span>Adoption profile</span>
        <Select
          value={profile}
          onValueChange={setProfile}
          disabled={mutation.isPending}
        >
          <SelectTrigger aria-label='Adoption profile'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.adoptionProfiles.map((value) => (
              <SelectItem key={value} value={value}>
                {value[0] + value.slice(1).toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <p className='text-sm text-muted-foreground'>
        Default selects core requirements; Recommended adds broader evidence;
        Strict adds resilience requirements. All remain in observe mode.
      </p>
      <div className='grid gap-3 md:grid-cols-2'>
        {data.catalogue.map((pack) => (
          <label
            key={pack.id}
            className='flex cursor-pointer items-start gap-3 rounded-md border p-3'
          >
            <Checkbox
              className='mt-1'
              disabled={mutation.isPending}
              checked={selected.some(
                (ref) => ref.id === pack.id && ref.version === pack.version
              )}
              onCheckedChange={(checked) =>
                setSelected((refs) =>
                  checked
                    ? [
                        ...refs.filter((ref) => ref.id !== pack.id),
                        { id: pack.id, version: pack.version },
                      ]
                    : refs.filter((ref) => ref.id !== pack.id)
                )
              }
            />
            <span className='text-sm'>
              <span className='font-medium'>
                {pack.title} · v{pack.version}
              </span>
              <span className='mt-1 block text-muted-foreground'>
                {data.recommendations.find((ref) => ref.id === pack.id)
                  ?.reason ?? pack.description}
              </span>
            </span>
          </label>
        ))}
      </div>
      <Button
        disabled={mutation.isPending || selected.length === 0}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Saving…' : 'Save standards selection'}
      </Button>
      {mutation.error && (
        <p role='alert' className='text-sm text-destructive'>
          {mutation.error.message}
        </p>
      )}
    </div>
  )
}
export function RepositoryStandards({
  repositoryId,
  canManage,
}: {
  repositoryId: string
  canManage: boolean
}) {
  const query = useQuery<Standards>({
    queryKey: ['repository-standards', repositoryId],
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${encodeURIComponent(repositoryId)}/standards`,
        { credentials: 'include', signal }
      )
      if (!response.ok)
        throw new Error(
          'Could not load standards. Check repository selection and account access.'
        )
      return response.json() as Promise<Standards>
    },
  })
  const data = query.data
  return (
    <Card className='mb-6'>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3'>
        <div>
          <CardTitle>Engineering standards</CardTitle>
          <CardDescription className='mt-2'>
            Versioned packs and configuration gaps. Execution and policy gates
            are not evaluated.
          </CardDescription>
        </div>
        <Button
          variant='outline'
          size='sm'
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Reload standards
        </Button>
      </CardHeader>
      <CardContent className='space-y-6'>
        {query.isPending ? (
          <p role='status'>Loading standards…</p>
        ) : query.isError ? (
          <p role='alert' className='text-sm text-destructive'>
            {query.error.message}
          </p>
        ) : (
          data && (
            <>
              {!data.selectionIntegrity && (
                <p role='alert' className='text-sm text-destructive'>
                  Saved pack definitions do not match their recorded digests.
                  Controls are not evaluated; review and explicitly save
                  supported versions.
                </p>
              )}
              <div className='space-y-1 text-sm'>
                <p>
                  {data.selection
                    ? `Saved ${data.selection.profile.toLowerCase()} profile · revision ${data.selection.revision}`
                    : 'Recommendations only — no standards selection saved.'}
                </p>
                <p className='text-muted-foreground'>
                  Deployment organization · this repository · all branches ·
                  observe mode
                </p>
                <p className='text-muted-foreground'>
                  Posture snapshot:{' '}
                  {data.profileSnapshot
                    ? `${data.profileSnapshot.sourceSha.slice(0, 12)} · ${data.profileSnapshot.complete ? 'complete' : 'partial'} inspection`
                    : 'No repository profile yet; controls remain unknown.'}
                </p>
              </div>
              {canManage && (
                <SelectionEditor
                  key={data.selection?.id ?? 'unsaved'}
                  data={data}
                  repositoryId={repositoryId}
                />
              )}
              <div className='space-y-3'>
                <h3 className='font-medium'>Pack catalogue</h3>
                {data.catalogue.map((pack) => (
                  <details key={pack.id} className='rounded-md border p-3'>
                    <summary className='cursor-pointer text-sm font-medium'>
                      {pack.title} · v{pack.version}
                      {data.selection?.packs.some(
                        (ref) =>
                          ref.id === pack.id && ref.version === pack.version
                      )
                        ? ' · selected'
                        : ''}
                    </summary>
                    <p className='mt-3 text-sm text-muted-foreground'>
                      {pack.description} Stages: {pack.stages.join(', ')}.
                    </p>
                    <ul className='mt-3 space-y-3'>
                      {pack.rules.map((rule) => (
                        <li key={rule.id} className='text-sm'>
                          <div className='flex flex-wrap items-center gap-2'>
                            <span>{rule.title}</span>
                            <Badge variant='outline'>
                              {rule.capability.replace('_', ' ')}
                            </Badge>
                          </div>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {rule.id} · required in{' '}
                            {rule.requiredIn.join(', ').toLowerCase()}
                          </p>
                          <p className='mt-1 text-xs text-muted-foreground'>
                            {rule.guidance}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <p className='mt-3 text-xs break-all text-muted-foreground'>
                      Pack SHA-256: {pack.digest}
                    </p>
                  </details>
                ))}
              </div>
              <div className='space-y-3'>
                <h3 className='font-medium'>
                  {data.selection
                    ? 'Selected controls'
                    : 'Recommended control preview'}
                </h3>
                {data.controls.map((control) => (
                  <div
                    key={control.id}
                    className='rounded-md border p-3 text-sm'
                  >
                    <div className='flex flex-wrap items-center gap-2'>
                      <span>{control.title}</span>
                      <Badge variant='secondary'>
                        {control.required ? 'Required' : 'Advisory'}
                      </Badge>
                      <Badge variant='outline'>
                        {control.capability.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className='mt-2'>
                      {control.configuration === 'MISSING'
                        ? 'Configuration not detected'
                        : control.configuration === 'HINT_DETECTED'
                          ? 'Configuration hint detected — not evaluated'
                          : 'Configuration unknown'}
                    </p>
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {control.reason}
                    </p>
                    {control.evidence.map((item) => (
                      <p
                        key={item.path}
                        className='mt-1 text-xs break-all text-muted-foreground'
                      >
                        {item.path} · {item.blobSha.slice(0, 12)}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )
        )}
      </CardContent>
    </Card>
  )
}
