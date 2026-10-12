import {
  activateHover,
  closeHoverTooltips,
  EditorView,
  hasHoverTooltips,
  hoverTooltip,
  tooltips,
  ViewPlugin,
} from '@codemirror/view'
import { findingGuidanceText } from './finding-guidance-text'
import type { Finding } from './finding-types'

/** CodeMirror positions this outside the scrolling source without modifying its text. */
export function findingCodeTooltip(
  finding: Finding,
  firstLine: number,
  id: string
) {
  const guidance = findingGuidanceText(finding)
  const affected = (view: EditorView, pos: number) => {
    const number = view.state.doc.lineAt(pos).number + firstLine - 1
    return (
      finding.line !== null &&
      number >= finding.line &&
      number <= (finding.endLine ?? finding.line)
    )
  }
  const hover = hoverTooltip(
    (view, pos) => {
      if (!affected(view, pos)) return null
      const line = view.state.doc.lineAt(pos)
      return {
        pos: line.from,
        end: line.to,
        above: true,
        create() {
          const dom = document.createElement('div')
          dom.className = 'finding-code-tooltip'
          dom.id = id
          dom.setAttribute('role', 'tooltip')
          dom.setAttribute('aria-label', 'Problem and solution')
          const text = (tag: string, className: string, content: string) => {
            const node = document.createElement(tag)
            node.className = className
            node.textContent = content
            dom.appendChild(node)
          }
          text(
            'div',
            'finding-tooltip-meta',
            `Line ${line.number + firstLine - 1} · ${guidance.sourceLabel}`
          )
          text(
            'h3',
            'finding-tooltip-heading finding-tooltip-problem',
            'Problem'
          )
          text('p', 'finding-tooltip-title', guidance.title)
          if (guidance.explanation)
            text('p', 'finding-tooltip-copy', guidance.explanation)
          text(
            'h3',
            'finding-tooltip-heading finding-tooltip-solution',
            'Suggested solution'
          )
          text('p', 'finding-tooltip-copy', guidance.solution)
          text('p', 'finding-tooltip-attribution', guidance.attribution)
          return { dom, offset: { x: 0, y: 8 } }
        },
      }
    },
    { hoverTime: 200 }
  )
  const close = (view: EditorView) => {
    if (hasHoverTooltips(view.state))
      view.dispatch({ effects: closeHoverTooltips })
  }
  const open = (view: EditorView, pos: number) =>
    activateHover(view, pos, 1, { tooltip: hover })
  return [
    tooltips({ parent: document.body }),
    hover,
    EditorView.domEventHandlers({
      focusin(event, view) {
        if (
          event.target instanceof Element &&
          event.target.matches('.cm-reported-line')
        )
          open(view, view.posAtDOM(event.target))
        return false
      },
      focusout(event, view) {
        if (
          event.target instanceof Element &&
          event.target.matches('.cm-reported-line')
        )
          close(view)
        return false
      },
      keydown(event, view) {
        if (
          (event.key === 'Enter' || event.key === ' ') &&
          event.target instanceof Element &&
          event.target.matches('.cm-reported-line')
        ) {
          event.preventDefault()
          open(view, view.posAtDOM(event.target))
          return true
        }
        return false
      },
      click(event, view) {
        if (
          !(event.target instanceof Element) ||
          !event.target.closest('.cm-reported-line')
        )
          return false
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
        if (pos !== null && affected(view, pos)) open(view, pos)
        return false
      },
    }),
    ViewPlugin.define((view) => {
      const keydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') close(view)
      }
      const outside = (event: PointerEvent) => {
        if (
          event.target instanceof Node &&
          !view.dom.contains(event.target) &&
          !document.getElementById(id)?.contains(event.target)
        )
          close(view)
      }
      document.addEventListener('keydown', keydown)
      document.addEventListener('pointerdown', outside)
      return {
        destroy() {
          document.removeEventListener('keydown', keydown)
          document.removeEventListener('pointerdown', outside)
        },
      }
    }),
  ]
}
