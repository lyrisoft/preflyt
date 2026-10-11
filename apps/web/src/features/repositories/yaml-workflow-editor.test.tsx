import { useState } from 'react'
import '@/styles/index.css'
import { EditorView } from '@codemirror/view'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'
import { YamlWorkflowEditor } from './yaml-workflow-editor'

const workflow = `# Keep deployment jobs unchanged
name: "Build"
on: pull_request
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
          ref: \${{ github.sha }}
`

afterEach(() => {
  document.documentElement.classList.remove('dark')
  vi.restoreAllMocks()
})

it('colors YAML tokens and GitHub expressions in both themes without changing the source', async () => {
  const changed = vi.fn()
  const view = await render(
    <YamlWorkflowEditor
      value={workflow}
      onChange={changed}
      label='Workflow YAML'
    />
  )
  const field = view.getByRole('textbox', { name: 'Workflow YAML' }).element()
  for (const token of [
    'key',
    'string',
    'number',
    'constant',
    'expression',
    'comment',
  ])
    await expect
      .poll(() => field.querySelector(`.yaml-${token}`) !== null)
      .toBe(true)
  const key = field.querySelector('.yaml-key')!
  const comment = field.querySelector('.yaml-comment')!
  const light = getComputedStyle(key).color
  expect(light).not.toBe(getComputedStyle(comment).color)
  document.documentElement.classList.add('dark')
  await expect.poll(() => getComputedStyle(key).color !== light).toBe(true)
  expect(
    EditorView.findFromDOM(field as HTMLElement)?.state.doc.toString()
  ).toBe(workflow)
  expect(changed).not.toHaveBeenCalled()
})

it('supports indentation and preserves a replacement draft as read-only without emitting edits', async () => {
  const changed = vi.fn()
  function Editable() {
    const [value, setValue] = useState('jobs:\n')
    return (
      <YamlWorkflowEditor
        value={value}
        label='Workflow YAML'
        onChange={(next) => {
          changed(next)
          setValue(next)
        }}
      />
    )
  }
  const view = await render(<Editable />)
  const field = view.getByRole('textbox', { name: 'Workflow YAML' })
  await field.click()
  const editor = EditorView.findFromDOM(field.element() as HTMLElement)!
  editor.dispatch({ selection: { anchor: editor.state.doc.length } })
  await userEvent.keyboard('{Tab}build:')
  await expect.poll(() => editor.state.doc.toString()).toBe('jobs:\n  build:')
  expect(changed).toHaveBeenCalled()
  changed.mockClear()
  await view.rerender(
    <YamlWorkflowEditor
      value={workflow}
      label='Workflow YAML'
      readOnly
      onChange={changed}
    />
  )
  await expect.element(field).toHaveAttribute('aria-readonly', 'true')
  await field.click()
  await userEvent.keyboard('overwrite')
  expect(
    EditorView.findFromDOM(field.element() as HTMLElement)?.state.doc.toString()
  ).toBe(workflow)
  expect(changed).not.toHaveBeenCalled()
})

it('expands the whole workflow section without recreating the editor or losing its selection', async () => {
  const fullscreen = { element: null as Element | null }
  vi.spyOn(document, 'fullscreenElement', 'get').mockImplementation(
    () => fullscreen.element
  )
  vi.spyOn(Element.prototype, 'requestFullscreen').mockImplementation(function (
    this: Element
  ) {
    fullscreen.element = this
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  })
  vi.spyOn(document, 'exitFullscreen').mockImplementation(() => {
    fullscreen.element = null
    document.dispatchEvent(new Event('fullscreenchange'))
    return Promise.resolve()
  })
  function WorkflowSection() {
    const [section, setSection] = useState<HTMLDivElement | null>(null)
    return (
      <div ref={setSection} className='pipeline-workflow-editor'>
        <header>Review changes</header>
        <YamlWorkflowEditor
          value={workflow}
          label='Workflow YAML'
          fullscreenTarget={section}
        />
        <aside aria-label='Policy checks'>
          <h3>Policy checks</h3>
          <button type='button'>Rewrite workflow</button>
        </aside>
      </div>
    )
  }
  const view = await render(<WorkflowSection />)
  const field = view.getByRole('textbox', { name: 'Workflow YAML' })
  const editor = EditorView.findFromDOM(field.element() as HTMLElement)!
  const section = field.element().closest('.pipeline-workflow-editor')!
  editor.dispatch({ selection: { anchor: 14 } })
  await view.getByRole('button', { name: 'Open workflow fullscreen' }).click()
  await expect
    .element(view.getByRole('button', { name: 'Exit workflow fullscreen' }))
    .toHaveAttribute('aria-pressed', 'true')
  expect(fullscreen.element).toBe(section)
  expect(
    section.contains(
      view.getByRole('button', { name: 'Rewrite workflow' }).element()
    )
  ).toBe(true)
  expect(section.querySelector('header')?.textContent).toBe('Review changes')
  expect(EditorView.findFromDOM(field.element() as HTMLElement)).toBe(editor)
  expect(editor.state.selection.main.head).toBe(14)
  await view.getByRole('button', { name: 'Exit workflow fullscreen' }).click()
  await expect
    .element(view.getByRole('button', { name: 'Open workflow fullscreen' }))
    .toHaveAttribute('aria-pressed', 'false')
  expect(EditorView.findFromDOM(field.element() as HTMLElement)).toBe(editor)
  expect(editor.state.doc.toString()).toBe(workflow)
  expect(fullscreen.element).toBeNull()
})
