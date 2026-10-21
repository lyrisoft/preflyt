import '@/styles/index.css'
import { afterEach, expect, it } from 'vitest'
import { render } from 'vitest-browser-react'
import { page, userEvent } from 'vitest/browser'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './alert-dialog'
import { Button } from './button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './dialog'

afterEach(async () => {
  document.documentElement.style.fontSize = ''
  document.documentElement.classList.remove('dark')
  await page.viewport(1280, 900)
})

function LongForm() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>Open long form</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Model connection</DialogTitle>
          <DialogDescription>
            Review the connection before saving.
          </DialogDescription>
        </DialogHeader>
        {Array.from({ length: 12 }, (_, i) => (
          <label key={i} className='space-y-2 text-sm'>
            Connection field {i + 1}
            <input className='block w-full border p-2' />
          </label>
        ))}
        <DialogFooter>
          <DialogClose asChild>
            <Button>Save connection</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

for (const enlarged of [false, true]) {
  it(`keeps a long dialog inside a short window with keyboard access to its final action${enlarged ? ' at 200% text' : ''}`, async () => {
    await page.viewport(640, 480)
    if (enlarged) document.documentElement.style.fontSize = '200%'
    const view = await render(<LongForm />)
    await view.getByRole('button', { name: 'Open long form' }).click()
    const dialog = page.getByRole('dialog').element()
    await expect
      .poll(() => dialog.getBoundingClientRect().top)
      .toBeGreaterThanOrEqual(0)
    await expect
      .poll(() => dialog.getBoundingClientRect().bottom)
      .toBeLessThanOrEqual(480)
    expect(getComputedStyle(dialog).overflowY).toBe('auto')
    expect(dialog.scrollHeight).toBeGreaterThan(dialog.clientHeight)
    await expect
      .element(
        page.getByRole('textbox', { name: 'Connection field 1', exact: true })
      )
      .toHaveFocus()
    await userEvent.keyboard('{Tab}'.repeat(12))
    const save = page.getByRole('button', { name: 'Save connection' })
    await expect.element(save).toHaveFocus()
    expect(save.element().getBoundingClientRect().bottom).toBeLessThanOrEqual(
      480
    )
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
    await expect
      .element(view.getByRole('button', { name: 'Open long form' }))
      .toHaveFocus()
  })
}

it('keeps alert dialog recovery actions reachable in a short dark window with enlarged text', async () => {
  await page.viewport(640, 480)
  document.documentElement.style.fontSize = '200%'
  document.documentElement.classList.add('dark')
  const view = await render(
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button>Review change</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm configuration change</AlertDialogTitle>
          <AlertDialogDescription>
            {'Review the selected repository and its saved configuration before continuing. '.repeat(
              14
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep configuration</AlertDialogCancel>
          <AlertDialogAction>Apply configuration</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  await view.getByRole('button', { name: 'Review change' }).click()
  const dialog = page.getByRole('alertdialog').element()
  await expect
    .poll(() => dialog.getBoundingClientRect().top)
    .toBeGreaterThanOrEqual(0)
  await expect
    .poll(() => dialog.getBoundingClientRect().bottom)
    .toBeLessThanOrEqual(480)
  await expect
    .element(page.getByRole('button', { name: 'Keep configuration' }))
    .toHaveFocus()
  await userEvent.keyboard('{Tab}')
  await expect
    .element(page.getByRole('button', { name: 'Apply configuration' }))
    .toHaveFocus()
  expect(
    page
      .getByRole('button', { name: 'Apply configuration' })
      .element()
      .getBoundingClientRect().bottom
  ).toBeLessThanOrEqual(480)
  await userEvent.keyboard('{Escape}')
  await expect.element(page.getByRole('alertdialog')).not.toBeInTheDocument()
  await expect
    .element(view.getByRole('button', { name: 'Review change' }))
    .toHaveFocus()
})

it('preserves constrained editor dialogs and their inner scroll region', async () => {
  await page.viewport(640, 480)
  await render(
    <Dialog defaultOpen>
      <DialogContent className='flex h-[80dvh] max-h-[80dvh] flex-col overflow-hidden'>
        <DialogHeader className='shrink-0'>
          <DialogTitle>Review instructions</DialogTitle>
          <DialogDescription>Edit the saved instructions.</DialogDescription>
        </DialogHeader>
        <div
          data-testid='editor-scroll'
          className='min-h-0 flex-1 overflow-y-auto'
        >
          <div className='h-[1200px]'>Instruction body</div>
        </div>
        <DialogFooter className='shrink-0'>
          <Button>Save instructions</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
  const dialog = page.getByRole('dialog').element()
  expect(getComputedStyle(dialog).overflowY).toBe('hidden')
  expect(
    getComputedStyle(page.getByTestId('editor-scroll').element()).overflowY
  ).toBe('auto')
  await expect
    .poll(
      () =>
        page
          .getByRole('button', { name: 'Save instructions' })
          .element()
          .getBoundingClientRect().bottom
    )
    .toBeLessThanOrEqual(480)
})
