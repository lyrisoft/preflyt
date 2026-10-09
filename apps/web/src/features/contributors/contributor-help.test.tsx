import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
import type { HelpSection } from '@/components/page-help-drawer'
import { ContributorHelp } from './contributor-help'

vi.mock('@/components/page-help-drawer', () => ({
  PageHelpDrawer: ({
    title,
    sections,
  }: {
    title: string
    sections: HelpSection[]
  }) => (
    <aside aria-label={`${title} help`}>
      {sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          {section.content}
        </section>
      ))}
    </aside>
  ),
}))
it('groups metric definitions, counting rules, data sources and supplied limits in page help', () => {
  const html = renderToStaticMarkup(
    <ContributorHelp
      profile
      collectionEnabled={false}
      limitations={['Imported coverage is partial.']}
      lastReceivedAt='2026-10-09T08:00:00Z'
    />
  )
  for (const text of [
    'How activity is counted',
    'Data sources',
    'Pass rate',
    'Coverage',
    'Failed checks',
    'Missing evidence',
    'Attributed commits',
    'Imported coverage is partial.',
    'Last received:',
    'disabled',
  ])
    expect(html).toContain(text)
  expect(html).toContain('Missing evidence never counts as passing')
  expect(html).toContain('do not measure employee performance')
  expect(html).toContain('rather than the PR’s lifetime first assessment')
})
it('explains directory snapshot coverage and the difference between refresh and import', () => {
  const html = renderToStaticMarkup(<ContributorHelp profile={false} />)
  expect(html).toContain(
    'saved assessment is not necessarily verified or passing'
  )
  expect(html).toContain('Refresh local data reloads saved records')
  expect(html).toContain('No contributor records received yet')
})
