import { AlertTriangle } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { StatusBadge } from '@/components/status-badge'
import type { Profile } from './repository-queries'

export function InspectionBadge({ profile }: { profile: Profile }) {
  return (
    <Popover>
      <PopoverTrigger className='touch-target rounded-lg focus-visible:outline-2 focus-visible:outline-ring'>
        <StatusBadge
          tone={profile.complete ? 'success' : 'warning'}
          className='cursor-pointer'
        >
          {profile.complete ? 'Inspection complete' : 'Partial inspection'}
        </StatusBadge>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-80 max-w-[calc(100vw-2rem)] text-sm'
      >
        <p className='flex items-center gap-2 font-medium'>
          <AlertTriangle aria-hidden='true' className='size-4 text-warning' />
          Inspection scope
        </p>
        <ul className='mt-2 list-disc space-y-1 ps-5 text-muted-foreground'>
          {profile.report.warnings.length ? (
            profile.report.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))
          ) : (
            <li>
              {profile.complete
                ? 'All supported profile checks were inspected.'
                : 'Some files could not be read within discovery limits.'}
            </li>
          )}
        </ul>
        {!!profile.report.omittedPaths?.length && (
          <div
            className='mt-3 max-h-64 space-y-3 overflow-y-auto border-t pt-3'
            aria-label='Omitted inspection paths'
          >
            {profile.report.omittedPaths.map((item) => (
              <div
                key={`${item.kind}:${item.path}`}
                className='space-y-1 text-xs'
              >
                <code className='block wrap-anywhere'>{item.path}</code>
                <p className='text-muted-foreground'>{item.reason}</p>
                <p>
                  {item.affectedChecks.length
                    ? `Affected checks: ${item.affectedChecks.join(', ')}`
                    : 'Does not affect supported checks.'}
                </p>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
