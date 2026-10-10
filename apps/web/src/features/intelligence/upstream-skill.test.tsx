import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { UpstreamSkill } from './upstream-skill'

const request = vi.hoisted(() => vi.fn())
vi.mock('../repositories/governance-api', () => ({
  governanceRequest: request,
  governanceTextRequest: vi.fn(),
}))
it('requires inspecting content and acknowledging its license before opening a draft', async () => {
  request.mockResolvedValue({
    manifest: {
      name: 'Review',
      description: 'Inputs',
      instructions: 'Inspect inputs.',
      stages: ['pull_request'],
      repositories: [],
      source: 'GitHub pinned',
      license: '',
    },
    licenseText: 'MIT License',
    sha256: 'a'.repeat(64),
  })
  const draft = vi.fn(),
    view = await render(<UpstreamSkill disabled={false} onDocument={draft} />)
  await view.getByRole('button', { name: 'Import from GitHub' }).click()
  await view
    .getByRole('textbox', { name: 'Repository', exact: true })
    .fill('example/reviews')
  await view.getByRole('textbox', { name: 'Commit SHA' }).fill('a'.repeat(40))
  await view.getByRole('button', { name: 'Inspect files' }).click()
  await expect
    .element(view.getByRole('button', { name: 'Open draft' }))
    .toBeDisabled()
  await view.getByRole('textbox', { name: 'License', exact: true }).fill('MIT')
  await view.getByRole('checkbox').click()
  await view.getByRole('button', { name: 'Open draft' }).click()
  expect(draft).toHaveBeenCalledWith(
    expect.objectContaining({ license: 'MIT', source: 'GitHub pinned' })
  )
  expect(request).toHaveBeenCalledTimes(1)
})
