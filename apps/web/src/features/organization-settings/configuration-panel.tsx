import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  return (
    <form
      className='space-y-6 rounded-xl border bg-card p-6'
      onSubmit={(event) => {
        event.preventDefault()
        if (!stale) save.mutate()
      }}
    >
      <div className='flex flex-wrap items-start justify-between gap-4'>
        <div>
          <h2 className='text-base font-semibold'>System settings</h2>
          <p className='mt-1 text-sm text-muted-foreground'>
            Applies to every workspace.
          </p>
        </div>
        <div className='w-full sm:w-56'>
          <Label htmlFor='configuration-section' className='sr-only'>
            Configuration section
          </Label>
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger id='configuration-section'>
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
      </div>
      {data.restartRequired && (
        <p
          role='status'
          className='rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm'
        >
          Restart the API and worker to apply saved connection changes.
        </p>
      )}
      <div className='grid gap-x-8 gap-y-6 md:grid-cols-2'>
        {data.fields
          .filter((field) => field.group === group)
          .map((field) => {
            const value = draft?.values[field.key] ?? field.value
            const id = `configuration-${field.key}`
            const cleared = draft?.clearSecrets.includes(field.key) ?? false
            if (field.kind === 'boolean')
              return (
                <div
                  key={field.key}
                  className='flex min-h-12 items-center justify-between gap-4 rounded-lg border px-4 py-3'
                >
                  <Label htmlFor={id}>{field.label}</Label>
                  <Switch
                    id={id}
                    checked={value === 'true'}
                    disabled={save.isPending}
                    onCheckedChange={(checked) =>
                      change(field.key, String(checked))
                    }
                  />
                </div>
              )
            return (
              <div
                key={field.key}
                className={`space-y-2 ${field.key.endsWith('PRIVATE_KEY') ? 'md:col-span-2' : ''}`}
              >
                <div className='flex items-center justify-between gap-3'>
                  <Label htmlFor={id}>{field.label}</Label>
                  {field.kind === 'secret' && field.configured && (
                    <Button
                      type='button'
                      size='sm'
                      variant='ghost'
                      disabled={save.isPending}
                      onClick={() =>
                        setDraft((previous) => ({
                          revision: previous?.revision ?? data.revision,
                          values: { ...previous?.values, [field.key]: '' },
                          clearSecrets: cleared
                            ? previous!.clearSecrets.filter(
                                (name) => name !== field.key
                              )
                            : [...(previous?.clearSecrets ?? []), field.key],
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
                    onChange={(event) => change(field.key, event.target.value)}
                    className='font-mono text-xs'
                  />
                ) : (
                  <Input
                    id={id}
                    type={field.kind === 'secret' ? 'password' : 'text'}
                    inputMode={field.kind === 'number' ? 'numeric' : undefined}
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
                    onChange={(event) => change(field.key, event.target.value)}
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
      <div className='flex justify-end gap-2 border-t pt-4'>
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
          {save.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}
