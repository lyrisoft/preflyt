import '@/styles/index.css'
import { EditorView } from '@codemirror/view'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { StandardLibraryCard } from '../workspace/organization-standards-library'
import type { Pack } from './repository-queries'

afterEach(() => vi.restoreAllMocks())
it('opens highlighted, read-only YAML from a standard card and copies the exact snippet', async () => {
  const snippet =
    '# Keep existing jobs\n- name: Preflyt policy\n  uses: ./.github/actions/preflyt-policy\n  with:\n    api-url: https://preflyt.example\n'
  const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
  const pack = {
    id: 'standard',
    title: 'Application Security',
    version: '1.0.4',
    description: 'Security checks',
    rules: [],
    workflowSetup: {
      snippet,
      notes: [],
      ready: true,
      checkIds: ['security.sast'],
    },
  } as unknown as Pack
  const view = await render(
    <StandardLibraryCard
      pack={pack}
      organization
      canEdit
      onEdit={() => {}}
      onDetails={() => {}}
      onHistory={() => {}}
    />
  )
  await expect.element(view.getByRole('dialog')).not.toBeInTheDocument()
  await view.getByRole('button', { name: 'View YAML' }).click()
  await expect.element(view.getByRole('dialog')).toBeVisible()
  const field = view
    .getByRole('textbox', { name: /Application Security.*Workflow YAML/ })
    .element()
  expect(EditorView.findFromDOM(field)?.state.doc.toString()).toBe(snippet)
  expect(field.getAttribute('contenteditable')).toBe('false')
  expect(field.querySelector('.yaml-key')).not.toBeNull()
  await view.getByRole('button', { name: 'Copy snippet' }).click()
  expect(copy).toHaveBeenCalledWith(snippet)
})
