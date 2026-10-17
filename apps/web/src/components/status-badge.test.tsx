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

it('distinguishes available plans from future offerings', async () => {
  const view = await render(
    <>
      <StatusBadge tone='info'>Available now</StatusBadge>
      <StatusBadge tone='success'>Coming soon</StatusBadge>
    </>
  )
  await expect
    .element(view.getByText('Available now'))
    .toHaveClass('text-success-text')
  await expect
    .element(view.getByText('Coming soon'))
    .not.toHaveClass('text-success-text')
  expect(statusTones['coming soon']).toBe('neutral')
})

it('keeps success, failure, pending and inactive states consistent', () => {
  expect(statusTones.synced).toBe('success')
  expect(statusTones['inspection complete']).toBe('success')
  expect(statusTones.approved).toBe('success')
  expect(statusTones['model unavailable']).toBe('error')
  expect(statusTones['update available']).toBe('warning')
  expect(statusTones['sync needed']).toBe('warning')
  expect(statusTones.running).toBe('info')
  expect(statusTones['partial scan']).toBe('warning')
  expect(statusTones['verified ci coverage']).toBe('success')
  expect(statusTones['coverage not received']).toBe('warning')
  expect(statusTones['not configured']).toBe('neutral')
  expect(statusTones.disabled).toBe('neutral')
  expect(statusTones['built-in']).toBe('neutral')
  expect(statusTones.enabled).toBe('success')
  expect(statusTones.retired).toBe('neutral')
  expect(statusTones.superseded).toBe('neutral')
  expect(statusTones['organization baseline']).toBe('neutral')
})

it('preserves finding trust and gap semantics', () => {
  expect(statusTones.ignored).toBe('neutral')
  expect(statusTones.open).toBe('neutral')
  expect(statusTones.reported).toBe('neutral')
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
  expect(statusTones['ai suggestion']).toBe('info')
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

it('uses green for found files while keeping their label distinct from a passed check', () => {
  expect(statusTones['related files found']).toBe('success')
  expect(statusTones.passed).toBe('success')
})

it('preserves managed ruleset deployment status colors', () => {
  expect(statusTones.preview).toBe('warning')
  expect(statusTones.drifted).toBe('warning')
  expect(statusTones.unknown).toBe('warning')
  expect(statusTones.deploying).toBe('info')
  expect(statusTones['rolling back']).toBe('info')
  expect(statusTones['rolled back']).toBe('neutral')
})

it('uses semantic colors for the policy exception lifecycle', () => {
  expect(statusTones['pending review']).toBe('warning')
  expect(statusTones.approved).toBe('success')
  expect(statusTones.rejected).toBe('error')
  expect(statusTones.revoked).toBe('neutral')
  expect(statusTones.expired).toBe('warning')
  expect(statusTones['allowed with exception']).toBe('warning')
})

it('separates setup gaps, file observations and undetermined setup', async () => {
  const view = await render(
    <>
      <StatusBadge tone='success'>Not found</StatusBadge>
      <StatusBadge tone='warning'>Not determined</StatusBadge>
      <StatusBadge tone='info'>Related files found</StatusBadge>
      <StatusBadge tone='info'>Suggested</StatusBadge>
      <StatusBadge tone='info'>Required</StatusBadge>
    </>
  )
  await expect
    .element(view.getByText('Not found', { exact: true }))
    .toHaveClass('text-warning-text')
  await expect.element(view.getByText('Not determined')).toHaveClass('bg-muted')
  await expect
    .element(view.getByText('Related files found'))
    .toHaveClass('text-success-text')
  await expect.element(view.getByText('Suggested')).toHaveClass('bg-muted')
  await expect.element(view.getByText('Required')).toHaveClass('bg-muted')
  await view.unmount()
})

it('keeps CI-only setup and undetermined configuration neutral', async () => {
  const view = await render(
    <>
      <StatusBadge tone='warning'>CI evidence required</StatusBadge>
      <StatusBadge tone='warning'>Configuration not determined</StatusBadge>
    </>
  )
  await expect
    .element(view.getByText('CI evidence required'))
    .toHaveClass('bg-muted')
  await expect
    .element(view.getByText('Configuration not determined'))
    .toHaveClass('bg-muted')
  await view.unmount()
})

it('uses reviewed decision colors without treating fix-required as success', () => {
  expect(statusTones['to review']).toBe('warning')
  expect(statusTones['reviewed: no change needed']).toBe('success')
  expect(statusTones['reviewed: fix required']).toBe('warning')
})

it('uses green for Healthy even if a caller provides another tone', async () => {
  const view = await render(<StatusBadge tone='info'>Healthy</StatusBadge>)
  await expect
    .element(view.getByText('Healthy'))
    .toHaveClass('text-success-text')
  expect(statusTones['findings reported']).toBe('error')
})

it('maps overall Health labels to their semantic tones', () => {
  expect(statusTones.healthy).toBe('success')
  expect(statusTones.unhealthy).toBe('error')
  expect(statusTones['needs attention']).toBe('warning')
})

it('maps finding severity labels consistently across public previews', () => {
  expect(statusTones.critical).toBe('error')
  expect(statusTones.high).toBe('error')
  expect(statusTones.medium).toBe('warning')
  expect(statusTones.low).toBe('success')
})

it('uses green for Low severity even when a caller supplies blue', async () => {
  const view = await render(<StatusBadge tone='info'>Low</StatusBadge>)
  await expect
    .element(view.getByText('Low', { exact: true }))
    .toHaveClass('text-success-text')
})

it('distinguishes dark red Critical from light red High severity', async () => {
  const view = await render(
    <>
      <StatusBadge tone='error'>Critical</StatusBadge>
      <StatusBadge tone='error'>High</StatusBadge>
    </>
  )
  await expect
    .element(view.getByText('Critical', { exact: true }))
    .toHaveClass('bg-severity-critical', 'text-white')
  await expect
    .element(view.getByText('High', { exact: true }))
    .toHaveClass('bg-severity-high/10', 'text-severity-high-text')
})

it('labels partial analysis with the shared warning tone', async () => {
  const view = await render(
    <StatusBadge tone='warning'>Partial analysis</StatusBadge>
  )
  await expect
    .element(view.getByText('Partial analysis'))
    .toHaveClass('text-warning-text')
})

it('shows completed repository inspection in green and partial inspection in amber', async () => {
  const view = await render(
    <>
      <StatusBadge tone='info'>Inspected</StatusBadge>
      <StatusBadge tone='info'>Partially inspected</StatusBadge>
    </>
  )
  await expect
    .element(view.getByText('Inspected', { exact: true }))
    .toHaveClass('text-success-text')
  await expect
    .element(view.getByText('Partially inspected'))
    .toHaveClass('text-warning-text')
})

it('supports a compact badge without changing semantic colors', async () => {
  const view = await render(
    <StatusBadge compact tone='info'>
      Healthy
    </StatusBadge>
  )
  await expect
    .element(view.getByText('Healthy'))
    .toHaveClass(
      'text-success-text',
      'font-medium',
      'rounded-md',
      'border-transparent'
    )
})
