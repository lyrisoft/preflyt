import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { InspectionBadge } from './inspection-scope'
import type { Profile } from './repository-queries'

it.each([true, false])(
  'shows omitted paths and check impact for complete=%s',
  async (complete) => {
    const profile = {
      complete,
      report: {
        warnings: [],
        omittedPaths: [
          {
            path: complete ? 'AGENTS.md' : 'package.json',
            kind: 'symlink',
            scope: 'file',
            reason: 'File link is not followed.',
            affectedChecks: complete ? [] : ['frameworks', 'tests'],
          },
        ],
      },
    } as unknown as Profile
    const view = await render(<InspectionBadge profile={profile} />)
    await view
      .getByRole('button', {
        name: complete ? 'Inspected' : 'Partial inspection',
      })
      .click()
    await expect
      .element(
        view.getByText(complete ? 'AGENTS.md' : 'package.json', { exact: true })
      )
      .toBeVisible()
    await expect
      .element(view.getByText('File link is not followed.'))
      .toBeVisible()
    await expect
      .element(
        view.getByText(
          complete
            ? 'Does not affect supported checks.'
            : 'Affected checks: frameworks, tests'
        )
      )
      .toBeVisible()
  }
)
