import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { RefreshCw } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { useTheme } from '@/context/theme-provider'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Main } from '@/components/layout/main'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { NotificationPreferences } from '@/features/notifications/notification-preferences'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import { ConfigurationPanel } from './configuration-panel'

type Settings = {
  id: string
  name: string
  githubOrganization: string | null
  createdAt: string
  role: string
  canUpdate: boolean
}
async function settingsRequest<T>(options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/organizations/settings`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string
    } | null
    throw new Error(
      body?.message ??
        'Workspace settings are unavailable. Retry or check your permissions.'
    )
  }
  return response.json() as Promise<T>
}
export function OrganizationSettingsPage() {
  const session = useNavigationSession()
  const client = useQueryClient()
  const { theme, setTheme } = useTheme()
  const [draft, setDraft] = useState<{
    organizationId: string
    name: string
  } | null>(null)
  const name =
    draft?.organizationId === session.data?.organizationId
      ? (draft?.name ?? null)
      : null
  const key = ['organization-settings', session.data?.organizationId]
  const settings = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => settingsRequest<Settings>({ signal }),
    enabled: session.isSuccess,
    retry: false,
    gcTime: 0,
  })
  const save = useMutation({
    mutationFn: () =>
      settingsRequest<{ saved: true }>({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: (name ?? settings.data?.name ?? '').trim(),
        }),
      }),
    meta: { successMessage: 'Workspace settings saved' },
    onSuccess: async () => {
      setDraft(null)
      await client.invalidateQueries({ queryKey: key })
      await client.invalidateQueries({ queryKey: ['organizations'] })
    },
  })
  return (
    <Main className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-4'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>Settings</h1>
          <p className='mt-1 text-sm text-muted-foreground'>
            Manage your workspace and personal preferences.
          </p>
        </div>
        <div className='flex gap-2'>
          <Button
            size='sm'
            variant='outline'
            disabled={settings.isFetching}
            onClick={() => {
              void settings.refetch()
              void client.invalidateQueries({
                queryKey: ['deployment-configuration'],
              })
            }}
          >
            <RefreshCw className='size-4' />
            Refresh
          </Button>
          <PageHelpDrawer
            title='Settings'
            sections={[
              {
                title: 'Workspace identity',
                content:
                  'The connected GitHub organization supplies the sidebar identity. The Preflyt workspace name is a local display label. Only workspace Owners can change it; changing it does not rename your GitHub organization.',
              },
              {
                title: 'Deployment configuration',
                content:
                  'Super Admin can configure system-wide GitHub connections, single sign-on, SMTP and feature switches here. Saved secrets are encrypted and never returned to the browser. An empty secret field keeps its saved value; Clear saved removes it on save. Connection changes need an API and worker restart. Feature switches and history retention refresh every five seconds; background work applies them on its next run. Preflyt-run checks still require approved execution setup and tool reviews; AI reviews still require approved models and skills. Database, queue, origins, encryption keys and execution trust approvals remain deployment secrets. Existing environment settings are imported once on first startup; stored settings then take precedence.',
              },
              {
                title: 'Personal preferences',
                content:
                  'Notifications apply to your account in this workspace. Appearance is saved in this browser. Model credentials and access permissions are managed in their existing administration pages.',
              },
            ]}
          />
        </div>
      </div>
      <Tabs defaultValue='workspace' className='space-y-6'>
        <TabsList className='flex h-auto flex-wrap justify-start'>
          <TabsTrigger value='workspace'>Workspace</TabsTrigger>
          <TabsTrigger value='notifications'>Notifications</TabsTrigger>
          <TabsTrigger value='appearance'>Appearance</TabsTrigger>
          {session.data?.platformAdmin && (
            <TabsTrigger value='configuration'>Configuration</TabsTrigger>
          )}
        </TabsList>
        {session.data?.platformAdmin && (
          <TabsContent value='configuration'>
            <ConfigurationPanel />
          </TabsContent>
        )}
        <TabsContent value='workspace' className='space-y-6'>
          {settings.isPending ? (
            <p role='status'>Loading workspace settings…</p>
          ) : settings.isError ? (
            <p role='alert' className='text-sm text-destructive'>
              {settings.error.message}
            </p>
          ) : (
            settings.data && (
              <>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    save.mutate()
                  }}
                  className='max-w-3xl space-y-6 rounded-xl border bg-card p-6'
                >
                  <div className='grid gap-6 sm:grid-cols-2'>
                    <div className='space-y-2'>
                      <Label htmlFor='workspace-name'>Workspace name</Label>
                      <Input
                        id='workspace-name'
                        maxLength={120}
                        value={name ?? settings.data.name}
                        disabled={!settings.data.canUpdate || save.isPending}
                        onChange={(event) =>
                          setDraft({
                            organizationId: settings.data.id,
                            name: event.target.value,
                          })
                        }
                        required
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label>GitHub organization</Label>
                      <p className='flex h-9 items-center text-sm'>
                        {settings.data.githubOrganization ?? 'Not linked'}
                      </p>
                    </div>
                  </div>
                  <dl className='grid gap-4 border-t pt-4 text-sm sm:grid-cols-2'>
                    <div>
                      <dt className='text-muted-foreground'>Your role</dt>
                      <dd className='mt-1'>
                        {settings.data.role.replace(/_/g, ' ')}
                      </dd>
                    </div>
                    <div>
                      <dt className='text-muted-foreground'>Created</dt>
                      <dd className='mt-1'>
                        {new Date(settings.data.createdAt).toLocaleDateString()}
                      </dd>
                    </div>
                  </dl>
                  {save.isError && (
                    <p role='alert' className='text-sm text-destructive'>
                      {save.error.message}
                    </p>
                  )}
                  {settings.data.canUpdate && (
                    <div className='flex justify-end'>
                      <Button
                        size='sm'
                        disabled={
                          save.isPending ||
                          name === null ||
                          !name.trim() ||
                          name.trim() === settings.data.name
                        }
                      >
                        {save.isPending ? 'Saving…' : 'Save changes'}
                      </Button>
                    </div>
                  )}
                </form>
                <div className='flex flex-wrap gap-3'>
                  <Button size='sm' variant='outline' asChild>
                    <Link to='/access-control' search={{ tab: 'people' }}>
                      Access Control
                    </Link>
                  </Button>
                  <Button size='sm' variant='outline' asChild>
                    <Link to='/intelligence'>AI models</Link>
                  </Button>
                  <Button size='sm' variant='outline' asChild>
                    <Link to='/integrations'>Integrations</Link>
                  </Button>
                </div>
              </>
            )
          )}
        </TabsContent>
        <TabsContent value='notifications' className='max-w-3xl'>
          <NotificationPreferences />
        </TabsContent>
        <TabsContent value='appearance' className='max-w-3xl'>
          <section className='space-y-4 rounded-xl border bg-card p-6'>
            <h2 className='text-base font-semibold'>Appearance</h2>
            <div className='max-w-xs space-y-2'>
              <Label htmlFor='workspace-theme'>Theme</Label>
              <Select
                value={theme}
                onValueChange={(value) =>
                  setTheme(value as 'light' | 'dark' | 'system')
                }
              >
                <SelectTrigger id='workspace-theme'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='system'>System</SelectItem>
                  <SelectItem value='light'>Light</SelectItem>
                  <SelectItem value='dark'>Dark</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </Main>
  )
}
