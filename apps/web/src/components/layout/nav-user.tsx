import { useEffect, useRef, useState } from 'react'
import { Bug, ChevronsUpDown, Lightbulb, LogOut } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import useDialogState from '@/hooks/use-dialog-state'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { SignOutDialog } from '@/components/sign-out-dialog'
import type { FeedbackKind } from '@/features/feedback/feedback-link'
import { FeedbackPanel } from '@/features/feedback/feedback-panel'

type NavUserProps = {
  user: {
    name: string
    email: string
    avatar: string
  }
}

type Session = {
  email?: string | null
  role?: string
  platformAdmin?: boolean
}

export function NavUser({ user }: NavUserProps) {
  const { isMobile } = useSidebar()
  const accountTrigger = useRef<HTMLButtonElement>(null)
  const [feedbackKind, setFeedbackKind] = useState<FeedbackKind>('bug')
  const [feedbackOpen, setFeedbackOpen] = useState(false)
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
  const accountName = session?.platformAdmin
    ? 'Super Admin'
    : (session?.role?.replace(/_/g, ' ') ?? user.name)
  const accountEmail = session?.email || user.email
  const [open, setOpen] = useDialogState()

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                ref={accountTrigger}
                aria-label='Open account menu'
                size='lg'
                className='data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground'
              >
                <Avatar className='h-8 w-8 rounded-lg'>
                  <AvatarFallback className='rounded-lg'>PF</AvatarFallback>
                </Avatar>
                <div className='grid flex-1 text-start text-sm leading-tight'>
                  <span className='truncate font-semibold'>{accountName}</span>
                  <span className='truncate text-xs'>{accountEmail}</span>
                </div>
                <ChevronsUpDown className='ms-auto size-4' />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className='w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg'
              side={isMobile ? 'bottom' : 'right'}
              align='end'
              sideOffset={4}
              onCloseAutoFocus={(event) => {
                if (feedbackOpen) event.preventDefault()
              }}
            >
              <DropdownMenuLabel className='p-0 font-normal'>
                <div className='flex items-center gap-2 px-1 py-1.5 text-start text-sm'>
                  <Avatar className='h-8 w-8 rounded-lg'>
                    <AvatarFallback className='rounded-lg'>PF</AvatarFallback>
                  </Avatar>
                  <div className='grid flex-1 text-start text-sm leading-tight'>
                    <span className='truncate font-semibold'>
                      {accountName}
                    </span>
                    <span className='truncate text-xs'>{accountEmail}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => {
                  setFeedbackKind('bug')
                  setFeedbackOpen(true)
                }}
              >
                <Bug aria-hidden='true' />
                Report a bug
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setFeedbackKind('suggestion')
                  setFeedbackOpen(true)
                }}
              >
                <Lightbulb aria-hidden='true' />
                Suggest an improvement
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant='destructive'
                onSelect={() => setOpen(true)}
              >
                <LogOut />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <FeedbackPanel
        kind={feedbackKind}
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        onReturnFocus={() => accountTrigger.current?.focus()}
      />
      <SignOutDialog open={!!open} onOpenChange={setOpen} />
    </>
  )
}
