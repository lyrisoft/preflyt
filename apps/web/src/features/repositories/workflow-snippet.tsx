import { useState } from 'react'
import { Copy, Code2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { YamlWorkflowEditor } from './yaml-workflow-editor'

export type WorkflowSnippetData = {
  snippet: string
  notes: string[]
  ready: boolean
  checkIds: string[]
}
export function WorkflowSnippet({
  setup,
  title = 'Workflow snippet',
  compact = false,
}: {
  setup?: WorkflowSnippetData
  title?: string
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  if (!setup) return null
  return (
    <>
      <div className={compact ? '' : 'space-y-2'}>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          {!compact && <h3 className='text-sm font-medium'>{title}</h3>}
          <Button
            size='sm'
            variant='ghost'
            onClick={() => setOpen(true)}
            aria-haspopup='dialog'
          >
            <Code2 />
            View YAML
          </Button>
        </div>
        {!compact &&
          setup.notes.map((note) => (
            <p key={note} className='text-xs text-muted-foreground'>
              {note}
            </p>
          ))}
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='max-h-[90svh] overflow-y-auto sm:max-w-4xl'>
          <DialogHeader className='pr-8'>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Add these jobs to your PR workflow. Keep dependency installation
              before the policy step, and make the final gate depend on every
              check job.
            </DialogDescription>
          </DialogHeader>
          <div className='flex justify-end'>
            <Button
              size='sm'
              variant='outline'
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(setup.snippet)
                  toast.success('Workflow snippet copied')
                } catch {
                  toast.error('Could not copy. Select and copy the YAML below.')
                }
              }}
            >
              <Copy />
              Copy snippet
            </Button>
          </div>
          <div className='workflow-snippet overflow-hidden rounded-lg border [&_.cm-editor]:!h-[min(55svh,32rem)]'>
            <YamlWorkflowEditor value={setup.snippet} readOnly label={title} />
          </div>
          <div className='space-y-1'>
            {setup.notes.map((note) => (
              <p key={note} className='text-xs text-muted-foreground'>
                {note}
              </p>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
