import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { statusTones } from '@/lib/status-tones'
import { StatusBadge } from './status-badge'

it('enforces shared semantic colors even when a caller supplies the wrong tone', async () => {
  const view = await render(<StatusBadge tone='info'>Synced</StatusBadge>)
  await expect
    .element(view.getByText('Synced'))
    .toHaveClass('text-success-text')
  await expect
    .element(view.getByText('Synced'))
    .not.toHaveClass('text-info-text')
})

it('keeps success, failure, pending and inactive states consistent', () => {
  expect(statusTones.synced).toBe('success')
  expect(statusTones.approved).toBe('success')
  expect(statusTones['model unavailable']).toBe('error')
  expect(statusTones['sync needed']).toBe('warning')
  expect(statusTones.running).toBe('info')
  expect(statusTones.disabled).toBe('neutral')
  expect(statusTones['built-in']).toBe('neutral')
  expect(statusTones.enabled).toBe('success')
  expect(statusTones.retired).toBe('neutral')
})
