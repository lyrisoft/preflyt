import '@/styles/index.css'
import { expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import type { Finding } from './finding-types'
import { SourceCodeEditor } from './source-code-editor'

const lines = [
  { number: 10, text: 'def find_product(connection, name: str):' },
  {
    number: 11,
    text: '    query = f"SELECT name FROM products WHERE name = \'{name}\'"',
  },
  { number: 12, text: '    return connection.execute(query).fetchone()' },
]
it('preserves exact Python source while highlighting syntax, gutter numbers and the reported block', async () => {
  const view = await render(
    <SourceCodeEditor
      lines={lines}
      path='catalogue.py'
      reportedLine={11}
      reportedEndLine={12}
    />
  )
  const editor = page.getByRole('textbox', { name: 'Assessed source code' })
  await expect.element(editor).toHaveAttribute('aria-readonly', 'true')
  await expect.element(editor).toHaveAttribute('contenteditable', 'false')
  await expect
    .poll(() => document.querySelectorAll('.source-keyword').length)
    .toBeGreaterThan(0)
  expect(
    Array.from(document.querySelectorAll('.cm-line')).map(
      (el) => el.textContent
    )
  ).toEqual(lines.map((l) => l.text))
  expect(
    Array.from(document.querySelectorAll('.cm-lineNumbers .cm-gutterElement'))
      .slice(1)
      .map((el) => el.textContent)
  ).toEqual(['10', '11', '12'])
  expect(
    document.querySelectorAll('.cm-line[data-reported-line=true]')
  ).toHaveLength(2)
  expect(
    document.querySelectorAll('.cm-lineNumbers .cm-finding-gutter')
  ).toHaveLength(2)
  await editor.click()
  await userEvent.keyboard('cannot edit')
  expect(
    Array.from(document.querySelectorAll('.cm-line')).map(
      (el) => el.textContent
    )
  ).toEqual(lines.map((l) => l.text))
  await view.unmount()
})
it('renders code without wrapping or page overflow at 320px in both themes', async () => {
  await page.viewport(320, 900)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const view = await render(
      <div className='p-4'>
        <SourceCodeEditor
          lines={lines}
          path='catalogue.py'
          reportedLine={11}
          reportedEndLine={12}
        />
      </div>
    )
    await expect
      .element(page.getByRole('textbox', { name: 'Assessed source code' }))
      .toBeVisible()
    const affected = document.querySelector('.cm-reported-line')!
    const token = document.querySelector('.cm-reported-line .source-string')!
    const gutter = document.querySelector('.cm-lineNumbers .cm-finding-gutter')!
    expect(getComputedStyle(token).color).toBe(getComputedStyle(affected).color)
    expect(getComputedStyle(gutter).color).toBe(
      getComputedStyle(affected).color
    )
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    const scroller = document.querySelector('.cm-scroller')!
    expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    await view.unmount()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})

const finding: Finding = {
  id: 'test-finding',
  title: 'Unsafe query <img src=x onerror=alert(1)>',
  repositoryId: 'repo',
  repository: 'owner/repo',
  sourceSha: 'a'.repeat(40),
  assessmentId: 'assessment',
  observedAt: '2026-10-12T00:00:00Z',
  severity: 'high',
  status: 'FAIL',
  path: 'catalogue.py',
  line: 11,
  endLine: 12,
  ruleId: 'sql',
  evidence: [],
  verification: 'verified',
  occurrences: 1,
  reportGuidance: {
    version: 1,
    source: 'ANALYZER_REPORT',
    explanation: 'User input changes the SQL query.',
    advice: 'Use a parameterized query.',
  },
}
it('shows saved problem and solution on affected-line hover and dismisses with Escape', async () => {
  const view = await render(
    <SourceCodeEditor
      finding={finding}
      lines={lines}
      path='catalogue.py'
      reportedLine={11}
      reportedEndLine={12}
    />
  )
  await page
    .elementLocator(document.querySelector('.cm-reported-line .source-string')!)
    .hover()
  const tooltip = page.getByRole('tooltip', { name: 'Problem and solution' })
  await expect.element(tooltip).toBeVisible()
  await expect.element(tooltip).toHaveTextContent(finding.title)
  await expect
    .element(tooltip)
    .toHaveTextContent('User input changes the SQL query.')
  await expect.element(tooltip).toHaveTextContent('Use a parameterized query.')
  expect(document.querySelector('.finding-code-tooltip img')).toBeNull()
  await userEvent.keyboard('{Escape}')
  await expect.element(tooltip).not.toBeInTheDocument()
  await page
    .elementLocator(document.querySelector('.cm-line:not(.cm-reported-line)')!)
    .hover()
  await expect.element(tooltip).not.toBeInTheDocument()
  await view.unmount()
})
it('supports keyboard and tap access with a viewport-contained tooltip in both themes', async () => {
  await page.viewport(320, 900)
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const view = await render(
      <SourceCodeEditor
        finding={finding}
        lines={lines}
        path='catalogue.py'
        reportedLine={11}
        reportedEndLine={12}
      />
    )
    const button = page.getByRole('button', {
      name: 'Show problem and solution for line 11',
    })
    ;(button.element() as HTMLButtonElement).focus()
    const tooltip = page.getByRole('tooltip', { name: 'Problem and solution' })
    await expect.element(tooltip).toBeVisible()
    await expect
      .poll(() => {
        const rect = tooltip.element().getBoundingClientRect()
        return rect.left >= 0 && rect.right <= 320
      })
      .toBe(true)
    await userEvent.keyboard('{Escape}')
    await expect.element(tooltip).not.toBeInTheDocument()
    await button.click()
    await expect.element(tooltip).toBeVisible()
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await view.unmount()
    await expect.element(tooltip).not.toBeInTheDocument()
  }
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 800)
})
