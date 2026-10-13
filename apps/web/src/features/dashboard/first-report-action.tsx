import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ArrowRight, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { createFirstReport } from './create-first-report'

export function FirstReportAction({ repositoryId }: { repositoryId: string }) {
  const client = useQueryClient()
  const navigate = useNavigate()
  const [progress, setProgress] = useState('')
  const pending = useRef(false)
  const keys = useRef(new Map<string, string>())
  async function start() {
    if (pending.current) return
    pending.current = true
    try {
      const { assessment } = await createFirstReport(
        repositoryId,
        (inputs) => {
          const key = keys.current.get(inputs) ?? crypto.randomUUID()
          keys.current.set(inputs, key)
          return key
        },
        setProgress
      )
      toast.success('Your first report is ready')
      await Promise.all([
        client.invalidateQueries({ queryKey: ['engineering-dashboard'] }),
        client.invalidateQueries({
          queryKey: ['repository-standards', repositoryId],
        }),
        client.invalidateQueries({ queryKey: ['assessments', repositoryId] }),
      ])
      await navigate({
        to: '/repositories/$repositoryId',
        params: { repositoryId },
        search: { tab: 'assessments', assessment: assessment.id },
      })
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not create the report. Try again.'
      )
    } finally {
      pending.current = false
      setProgress('')
    }
  }
  return (
    <div className='flex flex-col items-end gap-2'>
      <Button onClick={() => void start()} disabled={!!progress}>
        {progress ? (
          <LoaderCircle
            aria-hidden='true'
            className='animate-spin motion-reduce:animate-none'
          />
        ) : (
          <ArrowRight aria-hidden='true' />
        )}
        {progress ? 'Preparing report…' : 'Create first report'}
      </Button>
      {progress && (
        <p role='status' className='text-xs text-muted-foreground'>
          {progress}
        </p>
      )}
    </div>
  )
}
