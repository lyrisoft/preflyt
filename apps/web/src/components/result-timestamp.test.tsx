import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { ResultTimestamp } from './result-timestamp'

it('uses a dash for missing and invalid timestamps without inventing a date', async () => {
  const view = await render(
    <div>
      <ResultTimestamp />
      <ResultTimestamp value={null} />
      <ResultTimestamp value='' />
      <ResultTimestamp value='invalid' />
    </div>
  )
  expect(view.container.textContent).toBe('----')
  expect(view.container.querySelector('time')).toBeNull()
})

it('shows an absolute date and time while preserving the source instant', async () => {
  const view = await render(
    <ResultTimestamp value='2026-10-13T09:20:00+01:00' stacked />
  )
  const time = view.container.querySelector('time')!
  expect(time.dateTime).toBe('2026-10-13T08:20:00.000Z')
  expect(time.title).toBe('2026-10-13T08:20:00.000Z')
  expect(time.textContent).toContain('2026')
  expect(time.textContent).toMatch(/\d{1,2}:20/)
})
