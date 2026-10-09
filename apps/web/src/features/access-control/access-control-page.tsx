import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, UsersRound, Plus, Save } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { AppHeader } from '@/components/layout/app-header'
import { Main } from '@/components/layout/main'
import { useNavigationSession } from '../workspace/navigation-session'
import { canPerform } from '../workspace/scoped-access'
import { useOrganizations } from './organization-queries'

type Member = {
  id: string
  identity: {
    id: string
    subject: string
    displayName: string | null
    email: string | null
  }
  role: string
  active: boolean
  repositoryIds: string[]
}
type Members = {
  roles: string[]
  members: Member[]
  audit: {
    id: string
    event: string
    actorId: string
    createdAt: string
    metadata: {
      membershipId?: string
      role?: string
      active?: boolean
      repositoryIds?: string[]
    }
  }[]
}
type Access = {
  organization: { id: string; name: string } | null
  repositories: { id: string; fullName: string }[]
  organizationWide: boolean
}
async function read<T>(path: string): Promise<T> {
  const r = await fetch(`${API_BASE_URL}/organizations/${path}`, {
    credentials: 'include',
  })
  if (!r.ok)
    throw new Error(
      r.status === 403
        ? 'Organization membership administration permission is required.'
        : 'Could not load organization access.'
    )
  return r.json() as Promise<T>
}
export function AccessControlPage() {
  const session = useNavigationSession(),
    organizations = useOrganizations(),
    client = useQueryClient(),
    canManage = canPerform(session.data, 'organization.members.manage')
  const [editing, setEditing] = useState<string | null>(null),
    [subject, setSubject] = useState(''),
    [displayName, setName] = useState(''),
    [role, setRole] = useState('DEVELOPER'),
    [active, setActive] = useState(true),
    [repoIds, setRepos] = useState<string[]>([]),
    [orgName, setOrgName] = useState('')
  const members = useQuery({
    queryKey: ['organization-members', session.data?.organizationId],
    queryFn: () => read<Members>('members'),
    enabled: canManage,
    retry: false,
  })
  const access = useQuery({
    queryKey: ['organization-access', session.data?.organizationId],
    queryFn: () => read<Access>('access'),
    retry: false,
  })
  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch(
        `${API_BASE_URL}/organizations/members${editing ? `/${editing}` : ''}`,
        {
          method: editing ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subject,
            displayName,
            role,
            active,
            repositoryIds: repoIds,
          }),
        }
      )
      if (!r.ok) {
        const body = (await r
          .json()
          .catch(() => ({ message: 'Could not save membership.' }))) as {
          message: string | string[]
        }
        throw new Error(
          Array.isArray(body.message) ? body.message.join(', ') : body.message
        )
      }
    },
    onSuccess: () => {
      setEditing(null)
      setSubject('')
      setName('')
      setRepos([])
      void client.invalidateQueries({ queryKey: ['organization-members'] })
    },
  })
  const create = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API_BASE_URL}/organizations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: orgName }),
      })
      if (!r.ok) throw new Error('Could not create organization.')
      return r.json() as Promise<{ id: string }>
    },
    onSuccess: async (org) => {
      setOrgName('')
      await fetch(`${API_BASE_URL}/organizations/${org.id}/activate`, {
        method: 'POST',
        credentials: 'include',
      })
      window.location.assign('/access-control')
    },
  })
  function edit(m: Member) {
    setEditing(m.id)
    setSubject(m.identity.subject)
    setName(m.identity.displayName ?? '')
    setRole(m.role)
    setActive(m.active)
    setRepos(m.repositoryIds)
    save.reset()
  }
  return (
    <>
      <AppHeader breadcrumbs={[{ label: 'Access control' }]} />
      <Main className='space-y-6'>
        <div>
          <p className='text-[10px] font-semibold tracking-widest text-muted-foreground uppercase'>
            Organization governance
          </p>
          <h1 className='mt-1 flex items-center gap-2 text-2xl font-semibold'>
            <ShieldCheck className='size-6 text-primary' />
            Access Control
          </h1>
          <p className='mt-2 text-sm text-muted-foreground'>
            Manage explicit memberships and repository assignments. Changes take
            effect on the next API request.
          </p>
        </div>
        {session.data?.platformAdmin && (
          <Card>
            <CardHeader>
              <CardTitle>Create an organization</CardTitle>
              <p className='text-sm text-muted-foreground'>
                Creating an organization explicitly assigns you as its Owner.
                Platform administration alone grants no repository access.
              </p>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  create.mutate()
                }}
                className='flex flex-wrap gap-3'
              >
                <Input
                  aria-label='Organization name'
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  maxLength={120}
                  className='max-w-sm'
                  placeholder='Organization name'
                />
                <Button disabled={create.isPending}>
                  <Plus className='size-4' />
                  Create and switch
                </Button>
              </form>
              {create.isError && (
                <p role='alert' className='mt-2 text-sm text-danger-text'>
                  {create.error.message}
                </p>
              )}
            </CardContent>
          </Card>
        )}
        {canManage ? (
          <>
            <div className='flex items-center justify-between'>
              <h2 className='text-lg font-semibold'>
                {access.data?.organization?.name ?? 'Active organization'}
              </h2>
              <Badge variant='outline'>
                {organizations.data?.organizations.length ?? 0} memberships
              </Badge>
            </div>
            <div className='grid items-start gap-5 xl:grid-cols-[1.3fr_1fr]'>
              <Card>
                <CardHeader>
                  <CardTitle>Members and roles</CardTitle>
                </CardHeader>
                <CardContent>
                  {members.isPending ? (
                    <p role='status'>Loading members…</p>
                  ) : members.isError ? (
                    <p role='alert'>{members.error.message}</p>
                  ) : (
                    <div className='space-y-3'>
                      {members.data.members.map((m) => (
                        <div
                          key={m.id}
                          className='flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3'
                        >
                          <div className='min-w-0'>
                            <p className='font-medium'>
                              {m.identity.displayName ??
                                m.identity.email ??
                                m.identity.subject}
                            </p>
                            <p
                              className='mt-1 truncate text-xs text-muted-foreground'
                              title={m.identity.subject}
                            >
                              OIDC subject: {m.identity.subject}
                            </p>
                            <div className='mt-2 flex flex-wrap gap-2'>
                              <Badge variant='outline'>
                                {m.role.replace(/_/g, ' ').toLowerCase()}
                              </Badge>
                              <Badge variant='outline'>
                                {m.active ? 'Active' : 'Revoked'}
                              </Badge>
                              <span className='text-xs text-muted-foreground'>
                                {['OWNER', 'ADMIN'].includes(m.role)
                                  ? 'All organization repositories'
                                  : `${m.repositoryIds.length} assigned repositories`}
                              </span>
                            </div>
                          </div>
                          <Button
                            size='sm'
                            variant='outline'
                            onClick={() => edit(m)}
                          >
                            Edit access
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <UsersRound className='size-4 text-chart-2' />
                    {editing ? 'Edit membership' : 'Provision member'}
                  </CardTitle>
                  <p className='text-xs text-muted-foreground'>
                    Use the exact subject from your configured OIDC provider.
                    Email or GitHub login does not establish identity.
                  </p>
                </CardHeader>
                <CardContent>
                  <form
                    className='space-y-4'
                    onSubmit={(e) => {
                      e.preventDefault()
                      save.mutate()
                    }}
                  >
                    <label className='block text-sm'>
                      OIDC subject
                      <Input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        required
                        disabled={!!editing}
                        maxLength={320}
                        className='mt-1'
                      />
                    </label>
                    {!editing && (
                      <label className='block text-sm'>
                        Display name
                        <Input
                          value={displayName}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={120}
                          className='mt-1'
                        />
                      </label>
                    )}
                    <label className='block text-sm'>
                      Role
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className='mt-1 h-9 w-full rounded-md border bg-background px-3'
                      >
                        {(members.data?.roles ?? [])
                          .filter(
                            (r) =>
                              session.data?.role === 'OWNER' ||
                              !['OWNER', 'ADMIN'].includes(r)
                          )
                          .map((r) => (
                            <option key={r} value={r}>
                              {r.replace(/_/g, ' ').toLowerCase()}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className='flex items-center gap-2 text-sm'>
                      <Checkbox
                        checked={active}
                        onCheckedChange={(v) => setActive(v === true)}
                      />
                      Active membership
                    </label>
                    {['OWNER', 'ADMIN'].includes(role) ? (
                      <p className='rounded-lg bg-accent p-3 text-xs text-accent-foreground'>
                        This administrative role has access to every repository
                        in this organization.
                      </p>
                    ) : (
                      <fieldset className='space-y-2 rounded-lg border p-3'>
                        <legend className='px-1 text-xs font-medium'>
                          Assigned repositories
                        </legend>
                        {access.data?.repositories.map((r) => (
                          <label
                            key={r.id}
                            className='flex items-center gap-2 text-sm'
                          >
                            <Checkbox
                              checked={repoIds.includes(r.id)}
                              onCheckedChange={(v) =>
                                setRepos((ids) =>
                                  v === true
                                    ? [...ids, r.id]
                                    : ids.filter((id) => id !== r.id)
                                )
                              }
                            />
                            {r.fullName}
                          </label>
                        ))}
                        {!access.data?.repositories.length && (
                          <p className='text-xs text-muted-foreground'>
                            Connect the organization's GitHub App to assign
                            repositories.
                          </p>
                        )}
                      </fieldset>
                    )}
                    {save.isError && (
                      <p role='alert' className='text-sm text-danger-text'>
                        {save.error.message}
                      </p>
                    )}
                    {save.isSuccess && (
                      <p role='status' className='text-sm text-success-text'>
                        Membership and repository grants saved.
                      </p>
                    )}
                    <div className='flex gap-2'>
                      <Button disabled={save.isPending}>
                        <Save className='size-4' />
                        Save access
                      </Button>
                      {editing && (
                        <Button
                          type='button'
                          variant='outline'
                          onClick={() => {
                            setEditing(null)
                            setSubject('')
                            setRepos([])
                            setRole('DEVELOPER')
                            setActive(true)
                          }}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className='pt-6 text-sm text-muted-foreground'>
              {session.isPending
                ? 'Checking permissions…'
                : 'Organization Owner or Admin membership is required to manage users. Select an organization where you have that permission.'}
            </CardContent>
          </Card>
        )}
        {canManage && members.data && (
          <Card>
            <CardHeader>
              <CardTitle>Recent access changes</CardTitle>
              <p className='text-xs text-muted-foreground'>
                Last 20 audited changes in the active organization.
              </p>
            </CardHeader>
            <CardContent className='space-y-3'>
              {members.data.audit.length ? (
                members.data.audit.map((a) => (
                  <div
                    key={a.id}
                    className='flex flex-wrap items-center justify-between gap-2 border-b pb-3 text-xs last:border-0'
                  >
                    <div>
                      <p className='font-medium'>
                        {a.event === 'organization_membership_changed'
                          ? 'Membership updated'
                          : 'Organization created'}
                      </p>
                      <p className='mt-1 text-muted-foreground'>
                        {a.metadata.role ?? 'OWNER'} ·{' '}
                        {a.metadata.active === false ? 'revoked' : 'active'} ·{' '}
                        {a.metadata.repositoryIds?.length ?? 0} explicit
                        repository grants
                      </p>
                      <p className='mt-1 font-mono text-muted-foreground'>
                        Actor {a.actorId}
                      </p>
                    </div>
                    <time
                      dateTime={a.createdAt}
                      className='text-muted-foreground'
                    >
                      {new Date(a.createdAt).toLocaleString()}
                    </time>
                  </div>
                ))
              ) : (
                <p className='text-sm text-muted-foreground'>
                  No access changes recorded yet.
                </p>
              )}
            </CardContent>
          </Card>
        )}
        <p className='text-xs text-muted-foreground'>
          Team inheritance and custom roles are not available. Policy
          enforcement, exception approval, sandbox execution and AI egress
          permissions remain separate release controls.
        </p>
      </Main>
    </>
  )
}
