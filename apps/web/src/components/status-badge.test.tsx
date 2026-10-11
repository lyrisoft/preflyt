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
  expect(statusTones['execution verified']).toBe('success')
  expect(statusTones['newer result available']).toBe('warning')
  expect(statusTones['result expired']).toBe('error')
  expect(statusTones['multiple matching results']).toBe('error')
  expect(statusTones['not run']).toBe('neutral')
  expect(statusTones['suggestions only']).toBe('info')
})

it('uses shared delivery colors for email notification states', () => {
  expect(statusTones['email sent']).toBe('success')
  expect(statusTones['email queued']).toBe('warning')
  expect(statusTones['email failed']).toBe('error')
  expect(statusTones['email skipped']).toBe('neutral')
})

it('preserves merge review result colors', () => {
  expect(statusTones['required checks passed']).toBe('success')
  expect(statusTones['required checks failed']).toBe('error')
  expect(statusTones['required results incomplete']).toBe('warning')
  expect(statusTones['optional checks need attention']).toBe('warning')
  expect(statusTones.incomplete).toBe('warning')
  expect(statusTones['not evaluated']).toBe('warning')
})

it('keeps changed policy requirements and review-needed scope amber', async () => {
  expect(statusTones['draft ready']).toBe('warning')
  expect(statusTones.conflict).toBe('error')
  const view = await render(
    <>
      <StatusBadge tone='success'>Standards changed</StatusBadge>
      <StatusBadge tone='info'>Needs review</StatusBadge>
    </>
  )
  await expect
    .element(view.getByText('Standards changed'))
    .toHaveClass('text-warning-text')
  await expect
    .element(view.getByText('Needs review'))
    .toHaveClass('text-warning-text')
})

it('keeps an unavailable assessment result amber even when a caller asks for blue', async () => {
  const view = await render(
    <StatusBadge tone='info'>Result unavailable</StatusBadge>
  )
  await expect
    .element(view.getByText('Result unavailable'))
    .toHaveClass('text-warning-text')
  await view.unmount()
})

it('keeps connected CI jobs green and missing connections amber', async () => {
  const view = await render(
    <>
      <StatusBadge tone='info'>Connected</StatusBadge>
      <StatusBadge tone='info'>Not connected</StatusBadge>
    </>
  )
  await expect
    .element(view.getByText('Connected', { exact: true }))
    .toHaveClass('text-success-text')
  await expect
    .element(view.getByText('Not connected'))
    .toHaveClass('text-warning-text')
  await view.unmount()
})

it('does not present detected configuration files as a passed check', () => {
  expect(statusTones['related files found']).toBe('info')
  expect(statusTones.passed).toBe('success')
})
