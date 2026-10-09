import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { NativeRequestHistory } from './native-check-requests'

const render = (state: string, allowed = true) =>
  renderToStaticMarkup(
    <NativeRequestHistory
      history={{
        items: [
          {
            id: 'request',
            sourceSha: 'a'.repeat(40),
            state,
            reason: 'DISPATCHER_REQUIRED',
            requestedAt: '2026-10-09T12:00:00Z',
          },
        ],
        page: 1,
        pages: 2,
        total: 21,
      }}
      allowed={allowed}
      busy={false}
      onCancel={() => {}}
      onPage={() => {}}
    />
  )
it('shows blocked requests without a result or cancellation claim', () => {
  const html = render('BLOCKED')
  expect(html).toContain('blocked')
  expect(html).toContain('not available yet')
  expect(html).not.toContain('Cancel request')
  expect(html).not.toContain('Passed')
  expect(html).toContain('Check request pages')
  expect(html).toContain('21 requests')
})
it('offers cancellation only for authorized active requests', () => {
  expect(render('RUNNING')).toContain('Cancel request')
  expect(render('RUNNING', false)).not.toContain('Cancel request')
  expect(render('CANCEL_REQUESTED')).not.toContain('Cancel request')
})
it('provides an empty history state', () => {
  const html = renderToStaticMarkup(
    <NativeRequestHistory
      history={{ items: [], page: 1, pages: 0, total: 0 }}
      allowed={false}
      busy={false}
      onCancel={() => {}}
      onPage={() => {}}
    />
  )
  expect(html).toContain('No check requests recorded')
  expect(html).not.toContain('Next')
})
