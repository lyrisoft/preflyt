import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { BranchPicker } from './branch-picker'

const query = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@tanstack/react-query', () => ({
  useInfiniteQuery: () => query.value,
}))
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))
vi.mock('@/components/ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandGroup: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandEmpty: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CommandInput: () => <input aria-label='Search branches' />,
}))
const render = () =>
  renderToStaticMarkup(
    <BranchPicker
      repositoryId='51'
      actorId='owner'
      value='development'
      onValueChange={() => {}}
    />
  )
beforeEach(() => {
  query.value = {
    isPending: false,
    isError: false,
    data: { pages: [{ branches: ['main', 'development'] }] },
    hasNextPage: false,
  }
})
it('shows searchable real branch choices and the selected branch', () => {
  const html = render()
  expect(html).toContain('Search branches')
  expect(html).toContain('Inspect branch: development')
  expect(html).toContain('main')
  expect(html).not.toContain('Load more branches')
})
it('shows loading, retry and paging states', () => {
  query.value = { isPending: true }
  expect(render()).toContain('Loading branches')
  query.value = { isError: true, error: new Error('Could not load branches') }
  expect(render()).toContain('Retry')
  query.value = { data: { pages: [{ branches: ['main'] }] }, hasNextPage: true }
  expect(render()).toContain('Load more branches')
})
