import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  Palette,
  RefreshCw,
  Save,
  Settings2,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
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
import { PageHeader } from '@/components/page-header'
import { PageHelpDrawer } from '@/components/page-help-drawer'
import { SurfaceIcon } from '@/components/surface-icon'
import { NotificationPreferences } from '@/features/notifications/notification-preferences'
import { OrganizationNotificationChannels } from '@/features/notifications/organization-notification-channels'
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
      <PageHeader
        title='Settings'
        description='Manage your workspace and personal preferences.'
        section='Administration'
        icon={Settings2}
        tone='blue'
        actions={
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
                void client.invalidateQueries({
                  queryKey: ['organization-notification-channels'],
                })
                void client.invalidateQueries({
                  queryKey: ['notification-preferences'],
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
                  title: 'Organization notification channels',
                  content:
                    'Owners and Admins can add multiple named email groups for organization-wide updates across connected repositories. Each channel supports up to 20 recipients. Email delivery uses deployment SMTP configuration; channels can be saved while delivery is unavailable. A test email is queued for the worker, and delivery status updates here. Email sent means the mail server accepted it, not that a recipient read it. Pausing cancels queued emails; an email already being sent cannot be recalled. Organization channels are independent of your personal notification preferences and sign-in email. In-app access remains required to open linked content.',
                },
                {
                  title: 'Personal preferences',
                  content:
                    'Notifications apply to your account in this workspace. Appearance is saved in this browser. Model credentials and access permissions are managed in their existing administration pages.',
                },
              ]}
            />
          </div>
        }
      />
      <Tabs defaultValue='workspace' className='space-y-6'>
        <TabsList className='flex h-auto flex-wrap justify-start gap-1'>
          <TabsTrigger value='workspace'>
            <Building2 className='size-4' />
            Workspace
          </TabsTrigger>
          <TabsTrigger value='notifications'>
            <Bell className='size-4' />
            Notifications
          </TabsTrigger>
          <TabsTrigger value='appearance'>
            <Palette className='size-4' />
            Appearance
          </TabsTrigger>
          {session.data?.platformAdmin && (
            <TabsTrigger value='configuration'>
              <SlidersHorizontal className='size-4' />
              Configuration
            </TabsTrigger>
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
              <div className='grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]'>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    save.mutate()
                  }}
                  className='overflow-hidden rounded-xl border bg-card shadow-xs'
                >
                  <div className='flex items-center gap-3 border-b bg-muted/20 px-6 py-5'>
                    <SurfaceIcon icon={Building2} tone='blue' />
                    <h2 className='text-base font-semibold'>
                      Workspace identity
                    </h2>
                  </div>
                  <div className='space-y-6 p-6'>
                    <div className='max-w-xl space-y-2'>
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
                    <dl className='border-t pt-5 text-sm'>
                      <div className='flex flex-wrap items-center justify-between gap-2'>
                        <dt className='text-muted-foreground'>
                          GitHub organization
                        </dt>
                        <dd className='font-medium'>
                          {settings.data.githubOrganization ?? 'Not linked'}
                        </dd>
                      </div>
                    </dl>
                    {save.isError && (
                      <p role='alert' className='text-sm text-destructive'>
                        {save.error.message}
                      </p>
                    )}
                  </div>
                  {settings.data.canUpdate && (
                    <div className='flex justify-end border-t bg-muted/20 px-6 py-4'>
                      <Button
                        size='sm'
                        disabled={
                          save.isPending ||
                          name === null ||
                          !name.trim() ||
                          name.trim() === settings.data.name
                        }
                      >
                        <Save className='size-4' />
                        {save.isPending ? 'Saving…' : 'Save changes'}
                      </Button>
                    </div>
                  )}
                </form>
                <aside className='space-y-6'>
                  <section className='overflow-hidden rounded-xl border bg-card shadow-xs'>
                    <div className='flex items-center gap-3 border-b bg-muted/20 px-5 py-5'>
                      <SurfaceIcon icon={Users} tone='teal' />
                      <h2 className='text-base font-semibold'>
                        Workspace details
                      </h2>
                    </div>
                    <dl className='divide-y px-5 text-sm'>
                      <div className='flex items-center justify-between gap-4 py-4'>
                        <dt className='text-muted-foreground'>Your role</dt>
                        <dd className='font-medium'>
                          {settings.data.role.replace(/_/g, ' ')}
                        </dd>
                      </div>
                      <div className='flex items-center justify-between gap-4 py-4'>
                        <dt className='flex items-center gap-2 text-muted-foreground'>
                          <CalendarDays className='size-4' />
                          Created
                        </dt>
                        <dd className='font-medium tabular-nums'>
                          {new Date(
                            settings.data.createdAt
                          ).toLocaleDateString()}
                        </dd>
                      </div>
                    </dl>
                  </section>
                  <nav
                    aria-label='Related settings'
                    className='flex flex-col gap-2'
                  >
                    <Button
                      size='sm'
                      variant='outline'
                      className='justify-between'
                      asChild
                    >
                      <Link to='/access-control' search={{ tab: 'people' }}>
                        Access Control
                        <ArrowUpRight className='size-4' />
                      </Link>
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      className='justify-between'
                      asChild
                    >
                      <Link to='/intelligence'>
                        AI models
                        <ArrowUpRight className='size-4' />
                      </Link>
                    </Button>
                    <Button
                      size='sm'
                      variant='outline'
                      className='justify-between'
                      asChild
                    >
                      <Link to='/integrations'>
                        Integrations
                        <ArrowUpRight className='size-4' />
                      </Link>
                    </Button>
                  </nav>
                </aside>
              </div>
            )
          )}
        </TabsContent>
        <TabsContent value='notifications' className='max-w-4xl space-y-8'>
          <OrganizationNotificationChannels />
          <NotificationPreferences />
        </TabsContent>
        <TabsContent value='appearance' className='max-w-4xl'>
          <section className='overflow-hidden rounded-xl border bg-card shadow-xs'>
            <div className='flex items-center gap-3 border-b bg-muted/20 px-6 py-5'>
              <SurfaceIcon icon={Palette} tone='violet' />
              <h2 className='text-base font-semibold'>Appearance</h2>
            </div>
            <div className='p-6'>
              <div className='max-w-sm space-y-2'>
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
            </div>
          </section>
        </TabsContent>
      </Tabs>
    </Main>
  )
}
