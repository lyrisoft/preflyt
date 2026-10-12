import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { ContributorActivitySparkline } from './contributor-activity-sparkline'

it('shows real dated activity with an accessible description and a bounded sparkline', () => {
  const html = renderToStaticMarkup(
    <ContributorActivitySparkline
      login='dev'
      activity={[
        { date: '2026-10-01', count: 0 },
        { date: '2026-10-02', count: 3 },
        { date: '2026-10-03', count: 1 },
      ]}
      partial
    />
  )
  expect(html).toContain('4 recorded participations')
  expect(html).toContain('(partial records)')
  expect(html).toContain('polyline')
  expect(html).toContain('text-success-text')
  const missing = renderToStaticMarkup(
    <ContributorActivitySparkline login='dev' activity={null} />
  )
  expect(missing).not.toContain('polyline')
  expect(missing).toContain('unavailable')
})
