import { useState } from 'react'
import '@/styles/index.css'
import { afterEach, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, server, userEvent } from 'vitest/browser'
import { Button } from './button'
import { Checkbox } from './checkbox'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './collapsible'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './dropdown-menu'
import { OptionSelect } from './option-select'
import { Popover, PopoverTrigger, PopoverContent } from './popover'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './sheet'
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarInset,
  SidebarTrigger,
} from './sidebar'
import { Skeleton } from './skeleton'
import { Switch } from './switch'

function LayoutFixture() {
  const [open, setOpen] = useState(true)
  return (
    <SidebarProvider open={open} onOpenChange={setOpen}>
      <Sidebar collapsible='icon'>
        <SidebarContent>Navigation</SidebarContent>
      </Sidebar>
      <SidebarInset data-testid='layout-main'>
        <SidebarTrigger />
        <svg viewBox='0 0 1000 100' aria-label='Test chart'>
          <path
            d='M0 90 L100 60 L200 80 L300 20 L400 40 L500 10 L600 30 L700 20 L800 40 L900 15 L1000 30'
            fill='none'
            stroke='currentColor'
          />
        </svg>
        <table>
          <tbody>
            {Array.from({ length: 500 }, (_, i) => (
              <tr key={i}>
                <td>Fixture repository {i}</td>
                <td>Fixture assessment</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SidebarInset>
    </SidebarProvider>
  )
}
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 380))
it('profiles layout updates while toggling a chart-and-table sidebar', async () => {
  await page.viewport(1280, 900)
  await render(<LayoutFixture />)
  const main = document.querySelector('[data-testid="layout-main"]')!
  let updates = 0
  const observer = new ResizeObserver(() => updates++)
  observer.observe(main)
  await settle()
  updates = 0
  await page
    .getByRole('button', { name: 'Toggle Sidebar', exact: true })
    .click()
  await settle()
  observer.disconnect()
  expect(updates).toBeGreaterThan(0)
  expect(updates).toBeLessThanOrEqual(2)
})
it('profiles layout updates while opening a collapsible', async () => {
  await render(
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button>Expand fixture</Button>
      </CollapsibleTrigger>
      <CollapsibleContent className='CollapsibleContent'>
        <div style={{ height: 240 }}>Fixture content</div>
      </CollapsibleContent>
    </Collapsible>
  )
  const root = document.querySelector('[data-slot="collapsible"]')!
  let updates = 0
  const observer = new ResizeObserver(() => updates++)
  observer.observe(root)
  await settle()
  updates = 0
  await page.getByRole('button', { name: 'Expand fixture' }).click()
  await settle()
  observer.disconnect()
  expect(updates).toBeGreaterThan(0)
  expect(updates).toBeLessThanOrEqual(2)
})

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    setDesignMotion: (value: 'reduce' | 'no-preference') => Promise<void>
  }
}
const coarse = () => matchMedia('(pointer: coarse)').matches
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const originalMotion = reduced() ? 'reduce' : 'no-preference'
afterEach(async () => {
  await server.commands.setDesignMotion(originalMotion)
  document.documentElement.style.fontSize = ''
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})
function Controls() {
  const [choice, setChoice] = useState('one')
  return (
    <div className='mx-auto w-full max-w-sm space-y-4 p-4'>
      <div className='flex flex-wrap gap-2'>
        <Button size='sm'>Primary action</Button>
        <Button size='sm' variant='outline'>
          Secondary action
        </Button>
        <Button size='sm'>Connect a GitHub organization securely</Button>
        <Button size='sm' disabled>
          Unavailable
        </Button>
      </div>
      <div className='flex flex-wrap items-center gap-2'>
        <Switch aria-label='First switch' />
        <Switch aria-label='Second switch' />
        <Checkbox aria-label='Check option' />
      </div>
      <OptionSelect
        label='Fixture selection'
        value={choice}
        onValueChange={setChoice}
        options={[
          { value: 'one', label: 'First option' },
          { value: 'two', label: 'Second option' },
        ]}
      />
      <Sheet>
        <SheetTrigger asChild>
          <Button variant='outline'>Open help</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Fixture help</SheetTitle>
            <SheetDescription>Fixture instructions.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant='outline'>Open dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fixture dialog</DialogTitle>
            <DialogDescription>Fixture confirmation.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>Open menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Fixture item</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover>
        <PopoverTrigger asChild>
          <Button>Open popover</Button>
        </PopoverTrigger>
        <PopoverContent>Fixture popover</PopoverContent>
      </Popover>
      <Skeleton data-testid='loading-shape' className='h-6 w-full' />
    </div>
  )
}
it('preserves dense desktop controls and reserves non-overlapping 44px touch targets', async () => {
  await page.viewport(400, 900)
  await render(<Controls />)
  const button = page.getByRole('button', { name: 'Primary action' }).element()
  expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(
    coarse() ? 44 : 32
  )
  const switches = [...document.querySelectorAll('[data-slot="switch"]')]
  if (coarse()) {
    for (const control of [
      ...switches,
      document.querySelector('[data-slot="checkbox"]')!,
    ]) {
      expect(
        parseFloat(getComputedStyle(control, '::after').height)
      ).toBeGreaterThanOrEqual(44)
      const style = getComputedStyle(control),
        rect = control.getBoundingClientRect()
      expect(
        rect.height +
          parseFloat(style.marginTop) +
          parseFloat(style.marginBottom)
      ).toBeGreaterThanOrEqual(43.9)
    }
    const first = switches[0].getBoundingClientRect(),
      second = switches[1].getBoundingClientRect()
    expect(
      second.x + second.width / 2 - (first.x + first.width / 2)
    ).toBeGreaterThanOrEqual(44)
  }
  await page.getByRole('switch', { name: 'First switch' }).click()
  await expect
    .element(page.getByRole('switch', { name: 'First switch' }))
    .toBeChecked()
  await page.getByRole('combobox', { name: 'Fixture selection' }).click()
  await expect
    .element(page.getByRole('option', { name: 'First option', exact: true }))
    .toBeVisible()
  await expect
    .element(page.getByRole('option', { name: 'First option', exact: true }))
    .toHaveFocus()
  await userEvent.keyboard('{End}')
  await expect
    .element(page.getByRole('option', { name: 'Second option', exact: true }))
    .toHaveFocus()
  await userEvent.keyboard('{Enter}')
  await expect
    .element(page.getByRole('combobox', { name: 'Fixture selection' }))
    .toHaveTextContent('Second option')
})
it('provides pointer-down feedback without committing before release and preserves disabled actions', async () => {
  let pressed = '',
    clicks = 0
  const handler = vi.fn()
  await render(
    <>
      <Button
        onPointerDown={(e) => {
          pressed = getComputedStyle(e.currentTarget).backgroundColor
          expect(clicks).toBe(0)
        }}
        onClick={() => clicks++}
      >
        Press action
      </Button>
      <Button disabled onClick={handler}>
        Disabled action
      </Button>
    </>
  )
  const button = page.getByRole('button', { name: 'Press action' }).element()
  const normal = getComputedStyle(button).backgroundColor
  await page.getByRole('button', { name: 'Press action' }).click()
  expect(pressed).not.toBe(normal)
  expect(clicks).toBe(1)
  await expect
    .element(page.getByRole('button', { name: 'Disabled action' }))
    .toBeDisabled()
  expect(handler).not.toHaveBeenCalled()
})
it('keeps drawers snappy, dismissible and safe to reopen during an exit', async () => {
  await render(<Controls />)
  const trigger = page.getByRole('button', { name: 'Open help' })
  await trigger.click()
  const sheet = document.querySelector('[data-slot="sheet-content"]')!
  expect(getComputedStyle(sheet).animationDuration).toBe(
    reduced() ? '0s' : '0.22s'
  )
  const close = sheet.querySelector('[data-slot="sheet-dismiss"]')!
  expect(close.getBoundingClientRect().width).toBe(coarse() ? 44 : 32)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  // Toggle through Escape and reopening; focus must return to the trigger.
  await expect
    .element(page.getByRole('heading', { name: 'Fixture help' }))
    .not.toBeInTheDocument()
  await expect.element(trigger).toHaveFocus()
  await trigger.click()
  await userEvent.keyboard('{Escape}')
  await expect
    .element(page.getByRole('heading', { name: 'Fixture help' }))
    .not.toBeInTheDocument()
  await trigger.click()
  await expect
    .element(page.getByRole('heading', { name: 'Fixture help' }))
    .toBeVisible()
})
it('responds to reduced-motion changes while a sheet is open and covers portalled primitives', async () => {
  await render(<Controls />)
  await page.getByRole('button', { name: 'Open help' }).click()
  await server.commands.setDesignMotion('reduce')
  expect(
    getComputedStyle(document.querySelector('[data-slot="sheet-content"]')!)
      .animationName
  ).toBe('none')
  await userEvent.keyboard('{Escape}')
  for (const [label, slot] of [
    ['Open dialog', 'dialog-content'],
    ['Open menu', 'dropdown-menu-content'],
    ['Open popover', 'popover-content'],
  ] as const) {
    await page.getByRole('button', { name: label }).click()
    expect(
      getComputedStyle(document.querySelector(`[data-slot="${slot}"]`)!)
        .animationName
    ).toBe('none')
    await userEvent.keyboard('{Escape}')
  }
  await page.getByRole('combobox', { name: 'Fixture selection' }).click()
  expect(
    getComputedStyle(document.querySelector('[data-slot="select-content"]')!)
      .animationName
  ).toBe('none')
  await userEvent.keyboard('{Escape}')
  expect(
    getComputedStyle(document.querySelector('[data-slot="switch-thumb"]')!)
      .transitionDuration
  ).toBe('0s')
  expect(
    getComputedStyle(document.querySelector('[data-slot="skeleton"]')!)
      .animationName
  ).toBe('none')
})
it('scales action text with root text size without mobile overflow in either theme', async () => {
  await page.viewport(320, 1000)
  document.documentElement.style.fontSize = '32px'
  const view = await render(<Controls />)
  expect(
    getComputedStyle(
      page.getByRole('button', { name: 'Primary action' }).element()
    ).fontSize
  ).toBe('26px')
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
  await view.unmount()
  document.documentElement.style.fontSize = ''
  for (const dark of [false, true]) {
    document.documentElement.classList.toggle('dark', dark)
    const content = await render(<Controls />)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(320)
    await page.screenshot({
      element: document.querySelector('#vitest-root') ?? document.body,
      path: `__screenshots__/apple-controls-${coarse() ? 'touch' : 'desktop'}-${dark ? 'dark' : 'light'}.png`,
    })
    await content.unmount()
  }
})
