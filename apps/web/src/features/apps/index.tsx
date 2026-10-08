import { useEffect, useState } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import {
  Check,
  GitBranch,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
} from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfigDrawer } from '@/components/config-drawer'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'

const route = getRouteApi('/_authenticated/apps/')

type Repository = {
  githubId: string
  name: string
  fullName: string
  ownerLogin: string
  defaultBranch: string | null
  isPrivate: boolean
  selected: boolean
  installation: { accountLogin: string }
}

type Installation = { id: string; accountLogin: string; active: boolean }

export function Apps() {
  const { github, account } = route.useSearch()
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [installations, setInstallations] = useState<Installation[]>([])
  const [loading, setLoading] = useState(true)
  const [savingRepository, setSavingRepository] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function loadRepositories() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE_URL}/github/repositories`, {
        credentials: 'include',
      })
      if (!response.ok) throw new Error('Could not load GitHub repositories.')
      const result = (await response.json()) as {
        repositories: Repository[]
        installations: Installation[]
      }
      setRepositories(result.repositories)
      setInstallations(result.installations)
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load GitHub repositories.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/github/repositories`, {
          credentials: 'include',
        })
        if (!response.ok) throw new Error('Could not load GitHub repositories.')
        const result = (await response.json()) as {
          repositories: Repository[]
          installations: Installation[]
        }
        if (active) {
          setRepositories(result.repositories)
          setInstallations(result.installations)
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load GitHub repositories.'
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  async function setSelected(repository: Repository, selected: boolean) {
    setSavingRepository(repository.githubId)
    setError('')
    try {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${repository.githubId}/selection`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selected }),
        }
      )
      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? 'Only a Preflyt Owner or Admin can change repository selection.'
            : 'Could not update repository selection.'
        )
      }
      setRepositories((current) =>
        current.map((item) =>
          item.githubId === repository.githubId ? { ...item, selected } : item
        )
      )
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not update repository selection.'
      )
    } finally {
      setSavingRepository(null)
    }
  }

  return (
    <>
      <Header>
        <Search className='me-auto' />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <Main fixed>
        <div className='flex flex-wrap items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              GitHub repositories
            </h1>
            <p className='mt-1 text-muted-foreground'>
              Connect a GitHub App installation, then choose which repositories
              Preflyt may assess.
            </p>
          </div>
          <Button asChild>
            <a href={`${API_BASE_URL}/github/install`}>
              <GitBranch aria-hidden='true' /> Connect GitHub App
            </a>
          </Button>
        </div>

        {github === 'connected' && (
          <div
            role='status'
            className='mt-5 rounded-md border border-green-600/30 bg-green-600/5 p-3 text-sm'
          >
            GitHub installation connected{account ? ` for ${account}` : ''}.
            Select the repositories Preflyt should use.
          </div>
        )}
        {github === 'error' && (
          <div
            role='alert'
            className='mt-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
          >
            GitHub was not connected. The authorization may have expired or the
            installation could not be verified. Try again or contact your
            Preflyt administrator.
          </div>
        )}
        {installations.some((installation) => !installation.active) && (
          <div
            role='alert'
            className='mt-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
          >
            A GitHub installation is no longer available. Its repositories have
            been deselected. Reconnect the App to restore access.
          </div>
        )}
        {error && (
          <div
            role='alert'
            className='mt-5 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'
          >
            {error}
          </div>
        )}

        <Card className='mt-6'>
          <CardHeader className='flex flex-row items-center justify-between gap-4'>
            <div>
              <CardTitle>Available repositories</CardTitle>
              <CardDescription>
                Preflyt requests read access to repository metadata and
                contents. Selection does not run or modify repository code.
              </CardDescription>
            </div>
            <Button
              variant='outline'
              size='icon'
              onClick={() => void loadRepositories()}
              disabled={loading}
              aria-label='Refresh repositories'
            >
              {loading ? (
                <LoaderCircle className='animate-spin' />
              ) : (
                <RefreshCw />
              )}
            </Button>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className='flex min-h-32 items-center justify-center text-sm text-muted-foreground'>
                <LoaderCircle className='me-2 size-4 animate-spin' /> Loading
                repositories…
              </div>
            ) : repositories.length === 0 ? (
              <div className='flex min-h-40 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center'>
                <GitBranch className='mb-3 size-8 text-muted-foreground' />
                <h2 className='font-medium'>
                  {installations.some((installation) => !installation.active)
                    ? 'GitHub installation unavailable'
                    : 'No GitHub installation connected'}
                </h2>
                <p className='mt-1 max-w-lg text-sm text-muted-foreground'>
                  Connect the Preflyt GitHub App and grant it access only to the
                  repositories you want to assess.
                </p>
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <table className='w-full min-w-[38rem] text-sm'>
                  <thead>
                    <tr className='border-b text-left text-muted-foreground'>
                      <th className='w-12 py-3 pe-3 font-medium'>Selected</th>
                      <th className='py-3 pe-3 font-medium'>Repository</th>
                      <th className='py-3 pe-3 font-medium'>Installation</th>
                      <th className='py-3 pe-3 font-medium'>Default branch</th>
                      <th className='py-3 font-medium'>Access</th>
                    </tr>
                  </thead>
                  <tbody>
                    {repositories.map((repository) => (
                      <tr
                        key={repository.githubId}
                        className='border-b last:border-0'
                      >
                        <td className='py-3 pe-3'>
                          <Checkbox
                            checked={repository.selected}
                            disabled={savingRepository === repository.githubId}
                            onCheckedChange={(checked) =>
                              void setSelected(repository, checked === true)
                            }
                            aria-label={`Select ${repository.fullName}`}
                          />
                        </td>
                        <td className='py-3 pe-3 font-medium'>
                          {repository.fullName}
                        </td>
                        <td className='py-3 pe-3'>
                          {repository.installation.accountLogin}
                        </td>
                        <td className='py-3 pe-3'>
                          {repository.defaultBranch ?? 'Not set'}
                        </td>
                        <td className='py-3'>
                          <span className='inline-flex items-center gap-1.5 text-muted-foreground'>
                            {repository.isPrivate ? (
                              <LockKeyhole className='size-3.5' />
                            ) : (
                              <Check className='size-3.5' />
                            )}
                            {repository.isPrivate ? 'Private' : 'Public'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </Main>
    </>
  )
}
