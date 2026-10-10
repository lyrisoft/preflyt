import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  BrainCircuit,
  GitBranch,
  KeyRound,
  RotateCw,
  Save,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { SurfaceIcon } from '@/components/surface-icon'

type Field = {
  key: string
  label: string
  group: string
  kind: string
  value: string
  configured: boolean
  restart: boolean
  example?: string
}
type Configuration = {
  revision: number
  restartRequired: boolean
  fields: Field[]
  deploymentOnly: string[]
}
async function request<T>(options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/configuration`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(
      typeof body?.message === 'string'
        ? body.message
        : 'Configuration is unavailable. Refresh and try again.'
    )
  }
  return response.json() as Promise<T>
}
export function ConfigurationPanel() {
  const client = useQueryClient()
  const [group, setGroup] = useState('GitHub')
  const [draft, setDraft] = useState<{
    revision: number
    values: Record<string, string>
    clearSecrets: string[]
  } | null>(null)
  const query = useQuery({
    queryKey: ['deployment-configuration'],
    queryFn: ({ signal }) => request<Configuration>({ signal }),
    retry: false,
    gcTime: 0,
  })
  const save = useMutation({
    mutationFn: () =>
      request<{ restartRequired: boolean }>({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedRevision: draft?.revision,
          values: draft?.values ?? {},
          clearSecrets: draft?.clearSecrets ?? [],
        }),
      }),
    meta: { successMessage: 'Configuration saved' },
    onSuccess: async () => {
      setDraft(null)
      await client.invalidateQueries({ queryKey: ['deployment-configuration'] })
    },
  })
  const change = (key: string, value: string) =>
    setDraft((previous) => ({
      revision: previous?.revision ?? query.data!.revision,
      values: { ...previous?.values, [key]: value },
      clearSecrets: previous?.clearSecrets.filter((name) => name !== key) ?? [],
    }))
  if (query.isPending)
    return (
      <p role='status' className='text-sm'>
        Loading configuration…
      </p>
    )
  if (query.isError)
    return (
      <div className='space-y-3'>
        <p role='alert' className='text-sm text-destructive'>
          {query.error.message}
        </p>
        <Button
          size='sm'
          variant='outline'
          onClick={() => void query.refetch()}
        >
          Retry
        </Button>
      </div>
    )
  const data = query.data
  const groups = [...new Set(data.fields.map((field) => field.group))]
  const stale = draft !== null && draft.revision !== data.revision
  const fields = data.fields.filter((field) => field.group === group)
  const groupIcons: Record<string, LucideIcon> = {
    GitHub: GitBranch,
    Governance: ShieldCheck,
    'Single sign-on': KeyRound,
    Notifications: Bell,
    Intelligence: BrainCircuit,
    'Native execution': Server,
  }
  const groupIcon = groupIcons[group] ?? SlidersHorizontal
  return (
    <form
      className='space-y-5'
      onSubmit={(event) => {
        event.preventDefault()
        if (!stale) save.mutate()
      }}
    >
      {data.restartRequired && (
        <p
          role='status'
          className='flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-900 dark:text-amber-200'
        >
          <RotateCw className='mt-0.5 size-4 shrink-0' />
          Restart the API and worker to apply saved connection changes.
        </p>
      )}
      <div className='grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]'>
        <aside className='rounded-xl border bg-muted/20 p-5'>
          <div className='mb-5 flex items-center gap-3'>
            <SurfaceIcon icon={SlidersHorizontal} tone='blue' />
            <div>
              <h2 className='text-base font-semibold'>System settings</h2>
              <p className='mt-1 text-xs text-muted-foreground'>
                Applies to every workspace.
              </p>
            </div>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='configuration-section'>Configuration section</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger id='configuration-section' className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </aside>
        <section className='overflow-hidden rounded-xl border bg-card shadow-xs'>
          <div className='flex items-center gap-3 border-b bg-muted/20 px-6 py-5'>
            <SurfaceIcon icon={groupIcon} tone='teal' />
            <h3 className='text-base font-semibold'>{group}</h3>
          </div>
          <div className='grid gap-x-8 gap-y-6 p-6 md:grid-cols-2'>
            {fields
              .filter((field) => field.kind !== 'boolean')
              .map((field) => {
                const value = draft?.values[field.key] ?? field.value
                const id = `configuration-${field.key}`
                const cleared = draft?.clearSecrets.includes(field.key) ?? false
                return (
                  <div
                    key={field.key}
                    className={`space-y-2.5 ${field.key.endsWith('PRIVATE_KEY') ? 'md:col-span-2' : ''}`}
                  >
                    <div className='flex items-center justify-between gap-3'>
                      <Label htmlFor={id} className='flex items-center gap-2'>
                        {field.kind === 'secret' && (
                          <KeyRound className='size-3.5 text-muted-foreground' />
                        )}
                        {field.label}
                      </Label>
                      {field.kind === 'secret' && field.configured && (
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          className={
                            cleared
                              ? undefined
                              : 'text-destructive hover:bg-destructive/10 hover:text-destructive'
                          }
                          disabled={save.isPending}
                          onClick={() =>
                            setDraft((previous) => ({
                              revision: previous?.revision ?? data.revision,
                              values: { ...previous?.values, [field.key]: '' },
                              clearSecrets: cleared
                                ? previous!.clearSecrets.filter(
                                    (name) => name !== field.key
                                  )
                                : [
                                    ...(previous?.clearSecrets ?? []),
                                    field.key,
                                  ],
                            }))
                          }
                        >
                          {cleared ? 'Keep saved' : 'Clear saved'}
                        </Button>
                      )}
                    </div>
                    {field.key.endsWith('PRIVATE_KEY') ? (
                      <Textarea
                        id={id}
                        rows={4}
                        value={value}
                        disabled={save.isPending || cleared}
                        spellCheck={false}
                        placeholder={
                          field.configured
                            ? 'Saved securely. Enter a replacement PEM key.'
                            : field.example
                        }
                        onChange={(event) =>
                          change(field.key, event.target.value)
                        }
                        className='font-mono text-xs'
                      />
                    ) : (
                      <Input
                        id={id}
                        type={field.kind === 'secret' ? 'password' : 'text'}
                        inputMode={
                          field.kind === 'number' ? 'numeric' : undefined
                        }
                        autoComplete={
                          field.kind === 'secret' ? 'new-password' : 'off'
                        }
                        value={value}
                        disabled={save.isPending || cleared}
                        placeholder={
                          field.kind === 'secret' && field.configured
                            ? 'Saved securely. Enter a replacement.'
                            : field.example
                        }
                        onChange={(event) =>
                          change(field.key, event.target.value)
                        }
                      />
                    )}
                    {cleared && (
                      <p className='text-xs text-destructive'>
                        Will be cleared when you save.
                      </p>
                    )}
                  </div>
                )
              })}
            {fields.some((field) => field.kind === 'boolean') && (
              <div className='grid gap-4 border-t pt-6 md:col-span-2 md:grid-cols-2'>
                {fields
                  .filter((field) => field.kind === 'boolean')
                  .map((field) => (
                    <div
                      key={field.key}
                      className='flex min-h-14 items-center justify-between gap-4 rounded-lg border bg-muted/20 px-4 py-3'
                    >
                      <Label htmlFor={`configuration-${field.key}`}>
                        {field.label}
                      </Label>
                      <Switch
                        id={`configuration-${field.key}`}
                        checked={
                          (draft?.values[field.key] ?? field.value) === 'true'
                        }
                        disabled={save.isPending}
                        onCheckedChange={(checked) =>
                          change(field.key, String(checked))
                        }
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
      </div>
      {stale && (
        <p role='alert' className='text-sm text-destructive'>
          Configuration changed elsewhere. Discard your changes and reload
          before saving.
        </p>
      )}
      {save.isError && (
        <p role='alert' className='text-sm text-destructive'>
          {save.error.message}
        </p>
      )}
      <div className='flex flex-wrap justify-end gap-2 border-t pt-5'>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={save.isPending}
          onClick={() => {
            setDraft(null)
            save.reset()
            void query.refetch()
          }}
        >
          {draft ? 'Discard changes' : 'Reload'}
        </Button>
        <Button size='sm' disabled={!draft || stale || save.isPending}>
          <Save className='size-4' />
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
