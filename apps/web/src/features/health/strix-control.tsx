import { useId, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { StatusBadge } from '@/components/status-badge'
import { healthRequest } from './health-api'

export function StrixControl({
  repositoryId,
  scopeKey,
  disabled,
  checked,
  onCheckedChange,
  children,
  reviewProfile = 'general',
  onReviewProfileChange,
}: {
  reviewProfile?: 'general' | 'payment-risk-v1' | 'general-and-payment-risk-v1'
  onReviewProfileChange?: (
    profile: 'general' | 'payment-risk-v1' | 'general-and-payment-risk-v1'
  ) => void
  repositoryId: string
  scopeKey?: string
  disabled: boolean
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  children: ReactNode
}) {
  const helpId = useId()
  const capability = useQuery({
    queryKey: ['health-strix', repositoryId, scopeKey],
    queryFn: ({ signal }) =>
      healthRequest<{
        available: boolean
        reason: string
        reviewProfiles?: string[]
      }>(`repositories/${repositoryId}/health/strix`, signal),
    retry: false,
    staleTime: 30000,
  })
  const unavailableReason = capability.isPending
    ? 'Checking AI security review availability…'
    : capability.isError
      ? 'AI review availability could not be checked.'
      : !capability.data?.available
        ? capability.data?.reason
        : undefined
  return (
    <div
      role='group'
      aria-label='Repository assessment actions'
      className='inline-flex shrink-0 items-stretch rounded-md shadow-xs'
    >
      {children}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            size='sm'
            className='rounded-s-none border-s border-primary-foreground/20 px-2 shadow-none has-[>svg]:px-2 data-[state=open]:bg-primary/80 [&[data-state=open]>svg]:rotate-180'
            disabled={disabled}
            aria-label='Assessment options'
          >
            <ChevronDown
              aria-hidden='true'
              className='transition-transform duration-150 motion-reduce:transition-none'
            />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='end'
          className='w-72 max-w-[calc(100vw-2rem)]'
        >
          <DropdownMenuCheckboxItem
            checked={checked}
            disabled={!capability.data?.available}
            onCheckedChange={(value) => onCheckedChange(value === true)}
            onSelect={(event) => event.preventDefault()}
            aria-label='Include AI security review'
            aria-describedby={helpId}
            className='py-2'
          >
            Include AI security review
            <StatusBadge tone='warning'>beta</StatusBadge>
          </DropdownMenuCheckboxItem>
          {onReviewProfileChange && capability.data?.available && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>AI reviews</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={checked && reviewProfile !== 'payment-risk-v1'}
                disabled={
                  checked &&
                  reviewProfile === 'payment-risk-v1' &&
                  !capability.data?.reviewProfiles?.includes(
                    'general-and-payment-risk-v1'
                  )
                }
                onCheckedChange={(value) => {
                  if (value) {
                    onReviewProfileChange(
                      checked && reviewProfile === 'payment-risk-v1'
                        ? 'general-and-payment-risk-v1'
                        : 'general'
                    )
                    onCheckedChange(true)
                  } else if (reviewProfile === 'general-and-payment-risk-v1')
                    onReviewProfileChange('payment-risk-v1')
                  else onCheckedChange(false)
                }}
                onSelect={(event) => event.preventDefault()}
              >
                General security review
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={checked && reviewProfile !== 'general'}
                disabled={
                  !capability.data?.reviewProfiles?.includes(
                    'payment-risk-v1'
                  ) ||
                  (checked &&
                    reviewProfile === 'general' &&
                    !capability.data?.reviewProfiles?.includes(
                      'general-and-payment-risk-v1'
                    ))
                }
                onCheckedChange={(value) => {
                  if (value) {
                    onReviewProfileChange(
                      checked && reviewProfile === 'general'
                        ? 'general-and-payment-risk-v1'
                        : 'payment-risk-v1'
                    )
                    onCheckedChange(true)
                  } else if (reviewProfile === 'general-and-payment-risk-v1')
                    onReviewProfileChange('general')
                  else onCheckedChange(false)
                }}
                onSelect={(event) => event.preventDefault()}
              >
                Payment Risk Review
              </DropdownMenuCheckboxItem>
              <p className='px-2 ps-8 pb-2 text-xs text-muted-foreground'>
                Select either or both. Both use one source snapshot and one
                findings list.
              </p>
            </>
          )}
          <p
            id={helpId}
            className='px-2 ps-8 pb-2 text-xs leading-relaxed text-muted-foreground'
          >
            {capability.isPending
              ? 'Checking AI security review availability. Standard checks can still run.'
              : unavailableReason
                ? `${unavailableReason} AI review will be skipped; standard checks can still run.`
                : 'Reviews the same commit with the configured AI model. Provider charges may apply.'}
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
