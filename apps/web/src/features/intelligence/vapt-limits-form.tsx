import { type FormEvent } from 'react'
import { Gauge, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SurfaceIcon } from '@/components/surface-icon'

export type VaptLimits = {
  maxInputTokens: number
  maxOutputTokens: number
  maxModelCalls: number
  revision: number
}
export type VaptLimitBounds = Record<
  Exclude<keyof VaptLimits, 'revision'>,
  { min: number; max: number }
>
const fields = [
  {
    key: 'maxInputTokens',
    label: 'Input tokens per review',
    description:
      'Total source, instructions and conversation sent to the model.',
  },
  {
    key: 'maxOutputTokens',
    label: 'Output tokens per review',
    description: 'Total tokens returned by the model across all requests.',
  },
  {
    key: 'maxModelCalls',
    label: 'Model requests per review',
    description: 'Maximum number of model requests in one review.',
  },
] as const
const integerPattern = '(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)'
const formatNumber = (value: number) => value.toLocaleString('en-US')
function parseNumber(value: string) {
  return new RegExp(`^${integerPattern}$`).test(value)
    ? Number(value.replace(/,/g, ''))
    : NaN
}
function validateNumber(
  input: HTMLInputElement,
  range: { min: number; max: number }
) {
  const value = parseNumber(input.value)
  const valid =
    Number.isSafeInteger(value) && value >= range.min && value <= range.max
  input.setCustomValidity(
    valid
      ? ''
      : `Enter a whole number from ${formatNumber(range.min)} to ${formatNumber(range.max)}.`
  )
  return valid
}

export function VaptLimitsForm({
  limits,
  bounds,
  busy,
  save,
}: {
  limits: VaptLimits
  bounds: VaptLimitBounds
  busy: boolean
  save: (
    body: Omit<VaptLimits, 'revision'> & { expectedRevision: number }
  ) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    save({
      maxInputTokens: parseNumber(String(form.get('maxInputTokens'))),
      maxOutputTokens: parseNumber(String(form.get('maxOutputTokens'))),
      maxModelCalls: parseNumber(String(form.get('maxModelCalls'))),
      expectedRevision: limits.revision,
    })
  }
  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <div className='flex items-start gap-3 p-4'>
        <SurfaceIcon icon={Gauge} tone='violet' />
        <div className='min-w-0 space-y-1'>
          <h2 className='text-base font-semibold'>AI security review limits</h2>
          <p className='max-w-prose text-sm text-muted-foreground'>
            Limits apply to each new AI security review in this organization.
            Existing reviews keep their original limits. Higher limits can
            increase provider charges.
          </p>
        </div>
      </div>
      <form onSubmit={submit} aria-label='AI security review limits'>
        <CardContent className='px-4 pb-4'>
          <div className='grid gap-4 md:grid-cols-3'>
            {fields.map(({ key, label, description }) => (
              <div key={key} className='min-w-0 space-y-2'>
                <label
                  htmlFor={`vapt-${key}`}
                  className='block text-sm font-medium'
                >
                  {label}
                </label>
                <Input
                  id={`vapt-${key}`}
                  name={key}
                  type='text'
                  inputMode='numeric'
                  pattern={integerPattern}
                  defaultValue={formatNumber(limits[key])}
                  className='tabular-nums'
                  onChange={(event) =>
                    validateNumber(event.currentTarget, bounds[key])
                  }
                  onBlur={(event) => {
                    if (validateNumber(event.currentTarget, bounds[key]))
                      event.currentTarget.value = formatNumber(
                        parseNumber(event.currentTarget.value)
                      )
                  }}
                  required
                  disabled={busy}
                  aria-describedby={`vapt-${key}-help`}
                />
                <p
                  id={`vapt-${key}-help`}
                  className='text-xs text-muted-foreground'
                >
                  {description} Allowed: {formatNumber(bounds[key].min)}–
                  {formatNumber(bounds[key].max)}.
                </p>
              </div>
            ))}
          </div>
        </CardContent>
        <div className='flex justify-end border-t p-4'>
          <Button type='submit' disabled={busy}>
            {busy ? (
              <Loader2
                aria-hidden='true'
                className='motion-safe:animate-spin'
              />
            ) : (
              <Save aria-hidden='true' />
            )}
            {busy ? 'Saving…' : 'Save review limits'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
