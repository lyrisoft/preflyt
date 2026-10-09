import { useEffect, useState } from 'react'
import { API_BASE_URL } from '@/lib/api'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SignOutDialog } from '@/components/sign-out-dialog'

type Session = {
  authenticated: boolean
  email?: string | null
  role?: string
  platformAdmin?: boolean
}

export function ProfileDropdown() {
  const [open, setOpen] = useDialogState()
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${API_BASE_URL}/auth/session`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((value: Session | null) => {
        if (!controller.signal.aborted) setSession(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setSession(null)
      })
    return () => controller.abort()
  }, [])

  const role = session?.platformAdmin
    ? 'Super Admin'
    : (session?.role?.replace(/_/g, ' ') ?? 'Account')
  const email = session?.email || 'Signed-in Preflyt user'

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            className='relative h-8 w-8 rounded-full'
            aria-label='Open account menu'
          >
            <Avatar className='h-8 w-8'>
              <AvatarFallback>PF</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className='w-56' align='end' forceMount>
          <DropdownMenuLabel className='font-normal'>
            <div className='flex flex-col gap-1.5'>
              <p className='text-sm leading-none font-medium'>{role}</p>
              <p className='text-xs leading-none text-muted-foreground'>
                {email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant='destructive' onClick={() => setOpen(true)}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
