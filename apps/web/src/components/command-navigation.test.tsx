import '@/styles/index.css'
import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { CommandMenu } from './command-menu'

const state = vi.hoisted(() => ({ navigate: vi.fn() }))
vi.mock('@tanstack/react-router', () => ({ useNavigate: () => state.navigate }))
vi.mock('@/context/search-provider', () => ({
  useSearch: () => ({ open: true, setOpen: vi.fn() }),
}))
vi.mock('@/context/theme-provider', () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))
vi.mock('@/features/workspace/navigation-session', () => ({
  useNavigationSession: () => ({ data: { role: 'VIEWER', permissions: [] } }),
}))
it('finds direct sidebar tools in command search and keeps restricted administration hidden', async () => {
  const view = await render(<CommandMenu />)
  const search = page.getByRole('combobox')
  await search.fill('Skills')
  await expect
    .element(page.getByRole('option', { name: 'Skills', exact: true }))
    .toBeVisible()
  expect(
    document.querySelectorAll('[cmdk-item][data-value="Skills"]')
  ).toHaveLength(1)
  await search.fill('Policies')
  await expect
    .element(page.getByRole('option', { name: 'Policies' }))
    .toBeVisible()
  await page.getByRole('option', { name: 'Policies' }).click()
  expect(state.navigate).toHaveBeenCalledWith({ to: '/policies' })
  await search.fill('Access Control')
  await expect
    .element(page.getByRole('option', { name: 'Access Control' }))
    .not.toBeInTheDocument()
  await view.unmount()
})
