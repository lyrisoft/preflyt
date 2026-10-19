import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, LoaderCircle, Plus } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useNavigationSession } from '../workspace/navigation-session'

type Candidate = { githubId: string; fullName: string }
export function AddRepository({ onAdded }: { onAdded: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const session = useNavigationSession()
  const client = useQueryClient()
  const queryKey = [
    'repository-add-candidates',
    session.data?.identityId,
    session.data?.organizationId,
  ]
  const available = useQuery({
    queryKey,
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }): Promise<{ repositories: Candidate[] }> => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/available`,
        { credentials: 'include', signal, cache: 'no-store' }
      )
      if (!response.ok)
        throw new Error(
          'Could not load repositories available to add. Refresh and try again.'
        )
      return response.json()
    },
  })
  const add = useMutation({
    meta: { successMessage: 'Repository added' },
    mutationFn: async (repository: Candidate) => {
      const response = await fetch(
        `${API_BASE_URL}/github/repositories/${repository.githubId}/selection`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ selected: true }),
        }
      )
      if (!response.ok)
        throw new Error(
          'Could not add this repository. Refresh the list and check your access.'
        )
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['profile-view-session'] })
      await client.invalidateQueries({ queryKey })
      await onAdded()
      setOpen(false)
    },
  })
  const rows =
    available.data?.repositories.filter((repository) =>
      repository.fullName.toLowerCase().includes(search.trim().toLowerCase())
    ) ?? []
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (add.isPending) return
        setOpen(value)
        setSearch('')
        add.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden='true' /> Add repository
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Add repository</DialogTitle>
          <DialogDescription>
            Choose a repository available through your GitHub connection to add
            it to your Preflyt access.
          </DialogDescription>
        </DialogHeader>
        <Input
          aria-label='Search repositories to add'
          placeholder='Search repositories…'
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={add.isPending}
        />
        {available.isPending ? (
          <p role='status' className='py-4 text-sm text-muted-foreground'>
            Loading available repositories…
          </p>
        ) : available.isError ? (
          <div className='space-y-3'>
            <p role='alert' className='text-sm text-destructive'>
              {available.error.message}
            </p>
            <Button variant='outline' onClick={() => void available.refetch()}>
              Try again
            </Button>
          </div>
        ) : rows.length ? (
          <ul
            className='max-h-80 divide-y overflow-y-auto rounded-lg border'
            aria-label='Repositories available to add'
          >
            {rows.map((repository) => (
              <li
                key={repository.githubId}
                className='flex items-center gap-3 p-3'
              >
                <GitBranch
                  aria-hidden='true'
                  className='size-4 shrink-0 text-muted-foreground'
                />
                <span className='min-w-0 flex-1 text-sm font-medium break-all'>
                  {repository.fullName}
                </span>
                <Button
                  size='sm'
                  variant='outline'
                  aria-label={`Add ${repository.fullName}`}
                  disabled={add.isPending}
                  onClick={() => add.mutate(repository)}
                >
                  {add.isPending &&
                  add.variables?.githubId === repository.githubId ? (
                    <LoaderCircle
                      aria-hidden='true'
                      className='size-4 animate-spin motion-reduce:animate-none'
                    />
                  ) : (
                    'Add'
                  )}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className='py-4 text-sm text-muted-foreground'>
            {search
              ? 'No repositories match your search.'
              : 'No additional repositories are available. Update the GitHub App’s repository access to connect another repository.'}
          </p>
        )}
        {add.isError && (
          <p role='alert' className='text-sm text-destructive'>
            {add.error.message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
