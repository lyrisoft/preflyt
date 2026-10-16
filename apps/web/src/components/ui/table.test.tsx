import { expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { page } from 'vitest/browser'
import { Table, TableBody, TableRow, TableCell } from './table'

const rows = Array.from({ length: 31 }, (_, index) => (
  <TableRow key={index}>
    <TableCell>Record {index + 1}</TableCell>
  </TableRow>
))

it('keeps complete screen-reader chart data available without hidden pagination controls', async () => {
  await render(
    <div className='sr-only'>
      <Table pagination={false}>
        <TableBody>{rows}</TableBody>
      </Table>
    </div>
  )
  expect(document.querySelectorAll('tbody tr')).toHaveLength(31)
  expect(document.querySelector('[data-slot="select-trigger"]')).toBeNull()
  expect(document.querySelector('nav')).toBeNull()
})

it('defaults to ten rows, advances without losing records, and resets when size changes', async () => {
  const view = await render(
    <Table>
      <TableBody>{rows}</TableBody>
    </Table>
  )
  expect(document.querySelectorAll('tbody tr')).toHaveLength(10)
  await expect
    .element(view.getByRole('combobox', { name: 'Rows per page' }))
    .toHaveAttribute('data-slot', 'select-trigger')
  await expect
    .element(view.getByText('Record 1', { exact: true }))
    .toBeVisible()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  await expect
    .element(view.getByText('Record 11', { exact: true }))
    .toBeVisible()
  await view.getByRole('combobox', { name: 'Rows per page' }).click()
  await page.getByRole('option', { name: '25', exact: true }).click()
  expect(document.querySelectorAll('tbody tr')).toHaveLength(25)
  await expect
    .element(view.getByText('Record 1', { exact: true }))
    .toBeVisible()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  expect(document.querySelectorAll('tbody tr')).toHaveLength(6)
  await expect
    .element(view.getByRole('button', { name: 'Next', exact: true }))
    .toBeDisabled()
})

it('clamps a local page after the filtered result shrinks', async () => {
  const view = await render(
    <Table>
      <tbody>{rows}</tbody>
    </Table>
  )
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  await view.rerender(
    <Table>
      <tbody>{rows.slice(0, 3)}</tbody>
    </Table>
  )
  expect(document.querySelectorAll('tbody tr')).toHaveLength(3)
  await expect.element(view.getByText('1–3 of 3')).toBeVisible()
})

it('delegates server pagination and renders the returned rows without slicing them again', async () => {
  const onPageChange = vi.fn(),
    onPageSizeChange = vi.fn()
  const view = await render(
    <Table
      pagination={{
        page: 2,
        pageSize: 25,
        total: 80,
        onPageChange,
        onPageSizeChange,
      }}
    >
      <TableBody>{rows.slice(0, 25)}</TableBody>
    </Table>
  )
  expect(document.querySelectorAll('tbody tr')).toHaveLength(25)
  await expect.element(view.getByText('26–50 of 80')).toBeVisible()
  await view.getByRole('button', { name: 'Next', exact: true }).click()
  expect(onPageChange).toHaveBeenCalledWith(3)
  await view.getByRole('combobox', { name: 'Rows per page' }).click()
  await page.getByRole('option', { name: '50', exact: true }).click()
  expect(onPageSizeChange).toHaveBeenCalledWith(50)
})
