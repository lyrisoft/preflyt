import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bug, ExternalLink, Globe, Lightbulb } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SurfaceIcon } from '@/components/surface-icon'
import type { ReleaseStatus } from '@/features/releases/release-panel'
import { useNavigationSession } from '@/features/workspace/navigation-session'
import {
  feedbackLink,
  type FeedbackDraft,
  type FeedbackKind,
} from './feedback-link'

const emptyDraft = (): FeedbackDraft => ({
  title: '',
  details: '',
  outcome: '',
})
const titles = { bug: 'Report a bug', suggestion: 'Suggest an improvement' }

export function FeedbackPanel({
  kind,
  open,
  onOpenChange,
  onReturnFocus,
}: {
  kind: FeedbackKind
  open: boolean
  onOpenChange: (open: boolean) => void
  onReturnFocus: () => void
}) {
  const [drafts, setDrafts] = useState({
    bug: emptyDraft(),
    suggestion: emptyDraft(),
  })
  const session = useNavigationSession()
  // Share the saved release query with the sidebar; never check GitHub for updates here.
  const release = useQuery<ReleaseStatus>({
    queryKey: ['releases', session.data?.identityId],
    enabled: open && session.isSuccess,
    staleTime: 10 * 60 * 1000,
    retry: false,
    queryFn: async ({ signal }) => {
      const response = await fetch(`${API_BASE_URL}/releases`, {
        credentials: 'include',
        cache: 'no-store',
        signal,
      })
      if (!response.ok) throw new Error('Version unavailable')
      return response.json()
    },
  })
  const build = import.meta.env.VITE_PREFLYT_BUILD_VERSION
  const version = release.data?.development
    ? 'Development'
    : (release.data?.installed ??
      (build === 'development' ? 'Development' : build || 'Unavailable'))
  const draft = drafts[kind]
  const href = feedbackLink(kind, draft, version)
  const tooLong = href.length > 7500
  const ready =
    !release.isLoading &&
    !!draft.title.trim() &&
    !!draft.details.trim() &&
    !!draft.outcome.trim() &&
    !tooLong
  const update = (field: keyof FeedbackDraft, value: string) => {
    setDrafts((all) => ({ ...all, [kind]: { ...all[kind], [field]: value } }))
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl'
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onReturnFocus()
        }}
      >
        <DialogHeader className='shrink-0 pe-5 text-start'>
          <div className='flex items-center gap-3'>
            <SurfaceIcon icon={kind === 'bug' ? Bug : Lightbulb} tone='blue' />
            <div className='min-w-0 space-y-1'>
              <DialogTitle>{titles[kind]}</DialogTitle>
              <DialogDescription>
                Draft here, then review and submit on GitHub. All fields are
                required.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className='min-h-0 space-y-4 overflow-y-auto overscroll-contain pe-1'>
          <div className='flex gap-2 rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed text-muted-foreground'>
            <Globe aria-hidden='true' className='mt-0.5 size-4 shrink-0' />
            <p>
              Issues in lyrisoft/preflyt are public. Leave out credentials,
              customer data and private code or URLs. Only your draft and app
              version are included.
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='feedback-title'>Title</Label>
            <Input
              id='feedback-title'
              aria-required='true'
              maxLength={120}
              value={draft.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder={
                kind === 'bug'
                  ? 'What went wrong?'
                  : 'What would you like to improve?'
              }
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='feedback-details'>
              {kind === 'bug'
                ? 'Steps to reproduce'
                : 'What problem would this solve?'}
            </Label>
            <Textarea
              id='feedback-details'
              aria-required='true'
              className='max-h-40 min-h-24'
              maxLength={2000}
              value={draft.details}
              onChange={(event) => update('details', event.target.value)}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='feedback-outcome'>
              {kind === 'bug'
                ? 'Expected and actual behavior'
                : 'How should it work?'}
            </Label>
            <Textarea
              id='feedback-outcome'
              aria-required='true'
              className='max-h-40 min-h-24'
              maxLength={2000}
              value={draft.outcome}
              onChange={(event) => update('outcome', event.target.value)}
            />
          </div>
          <p className='text-xs text-muted-foreground'>
            Preflyt version: {version}. GitHub sign-in is required to submit.
          </p>
          {tooLong && (
            <p role='alert' className='text-sm text-destructive'>
              Shorten your draft to continue. You can add more detail on GitHub.
            </p>
          )}
          <p className='text-xs text-muted-foreground'>
            Security concern?{' '}
            <a
              href='mailto:support@lyrisoft.tech'
              className='font-medium text-foreground underline underline-offset-4'
            >
              Contact support privately
            </a>
            .
          </p>
        </div>
        <DialogFooter className='shrink-0 border-t pt-4'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {ready ? (
            <Button asChild>
              <a
                href={href}
                target='_blank'
                rel='noopener noreferrer'
                referrerPolicy='no-referrer'
              >
                Continue on GitHub
                <ExternalLink aria-hidden='true' />
              </a>
            </Button>
          ) : (
            <Button disabled>
              Continue on GitHub
              <ExternalLink aria-hidden='true' />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
