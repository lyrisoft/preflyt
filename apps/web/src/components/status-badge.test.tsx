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
  expect(statusTones.superseded).toBe('neutral')
  expect(statusTones['organization baseline']).toBe('neutral')
})

it('preserves finding trust and gap semantics', () => {
  expect(statusTones.reported).toBe('info')
  expect(statusTones.suppressed).toBe('neutral')
  expect(statusTones['evidence missing']).toBe('warning')
})

it('uses green for resolved triage and blue for ongoing review', async () => {
  const view = await render(
    <>
      <StatusBadge tone='info'>Resolved</StatusBadge>
      <StatusBadge tone='warning'>In review</StatusBadge>
    </>
  )
  await expect
    .element(view.getByText('Resolved'))
    .toHaveClass('text-success-text')
  await expect
    .element(view.getByText('In review'))
    .toHaveClass('text-info-text')
})

it('preserves evidence colors after wording changes', () => {
  expect(statusTones['source not verified']).toBe('warning')
  expect(statusTones['newer result available']).toBe('warning')
  expect(statusTones['result expired']).toBe('error')
  expect(statusTones['multiple matching results']).toBe('error')
  expect(statusTones['not run']).toBe('neutral')
  expect(statusTones['suggestions only']).toBe('info')
})
