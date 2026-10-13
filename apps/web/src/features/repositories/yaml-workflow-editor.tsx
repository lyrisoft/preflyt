import { useEffect, useRef, useState } from 'react'
import { indentWithTab } from '@codemirror/commands'
import { yaml } from '@codemirror/lang-yaml'
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
  syntaxTree,
} from '@codemirror/language'
import { Compartment, EditorState, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  keymap,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { basicSetup } from 'codemirror'
import { Maximize2, Minimize2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import './yaml-workflow-editor.css'

const colors = HighlightStyle.define([
  { tag: tags.comment, class: 'yaml-comment' },
  {
    tag: [tags.propertyName, tags.definition(tags.propertyName)],
    class: 'yaml-key',
  },
  {
    tag: [tags.string, tags.special(tags.string), tags.content],
    class: 'yaml-string',
  },
  { tag: [tags.bool, tags.null, tags.atom], class: 'yaml-constant' },
  { tag: tags.number, class: 'yaml-number' },
  { tag: [tags.meta, tags.labelName, tags.typeName], class: 'yaml-meta' },
  { tag: [tags.punctuation, tags.bracket], class: 'yaml-punctuation' },
  { tag: tags.invalid, class: 'yaml-invalid' },
])

// YAML's grammar treats plain scalar values uniformly. Give numbers, booleans,
// and GitHub expressions their own colors without interpreting or changing YAML.
function scalarDecorations(view: EditorView): DecorationSet {
  const marks: Range<Decoration>[] = []
  const seen = new Set<number>()
  for (const range of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from: range.from,
      to: range.to,
      enter(node) {
        if (
          !['Literal', 'QuotedLiteral', 'BlockLiteralContent'].includes(
            node.name
          ) ||
          node.node.parent?.name === 'Key' ||
          seen.has(node.from)
        )
          return
        seen.add(node.from)
        const text = view.state.doc.sliceString(node.from, node.to)
        if (node.name === 'Literal') {
          const className = /^(?:true|false|null|~)$/i.test(text)
            ? 'yaml-constant'
            : /^[+-]?(?:0x[\da-f]+|0o[0-7]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i.test(
                  text
                )
              ? 'yaml-number'
              : null
          if (className)
            marks.push(
              Decoration.mark({ class: className }).range(node.from, node.to)
            )
        }
        for (const match of text.matchAll(/\$\{\{.*?\}\}/g)) {
          const start = node.from + match.index!
          marks.push(
            Decoration.mark({ class: 'yaml-expression' }).range(
              start,
              start + match[0].length
            )
          )
        }
      },
    })
  }
  return Decoration.set(marks, true)
}
const workflowScalars = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = scalarDecorations(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      )
        this.decorations = scalarDecorations(update.view)
    }
  },
  { decorations: (plugin) => plugin.decorations }
)

const appearance = EditorView.theme({
  '&': {
    height: '34rem',
    color: 'var(--foreground)',
    backgroundColor: 'var(--yaml-background)',
    fontSize: '13px',
  },
  '&.cm-focused': { outline: '2px solid var(--ring)', outlineOffset: '-2px' },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily:
      'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    lineHeight: '1.7',
  },
  '.cm-content': { padding: '12px 0', caretColor: 'var(--foreground)' },
  '.cm-line': { padding: '0 12px' },
  '.cm-gutters': {
    backgroundColor: 'var(--yaml-gutter)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 12px',
    minWidth: '36px',
  },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'var(--yaml-active-line)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--yaml-selection)',
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-matchingBracket': {
    backgroundColor: 'var(--yaml-selection)',
    outline: '1px solid var(--ring)',
  },
  '.cm-panels': { backgroundColor: 'var(--muted)', color: 'var(--foreground)' },
  '.cm-panel.cm-search': { padding: '6px 10px' },
  '.cm-textfield, .cm-button': {
    color: 'var(--foreground)',
    background: 'var(--background)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--popover)',
    color: 'var(--popover-foreground)',
    border: '1px solid var(--border)',
  },
})

export function YamlWorkflowEditor({
  value,
  onChange,
  readOnly = false,
  label,
  fullscreenTarget,
}: {
  value: string
  onChange?: (value: string) => void
  readOnly?: boolean
  label: string
  fullscreenTarget?: HTMLElement | null
}) {
  const frame = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const editor = useRef<EditorView | null>(null)
  const initial = useRef({ value, label, readOnly })
  const options = useRef(new Compartment())
  const callback = useRef(onChange)
  const synchronizing = useRef(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [position, setPosition] = useState({ line: 1, column: 1 })

  useEffect(() => {
    const document = frame.current!.ownerDocument
    function syncFullscreen() {
      setFullscreen(
        document.fullscreenElement === (fullscreenTarget ?? frame.current)
      )
      editor.current?.requestMeasure()
    }
    syncFullscreen()
    document.addEventListener('fullscreenchange', syncFullscreen)
    return () =>
      document.removeEventListener('fullscreenchange', syncFullscreen)
  }, [fullscreenTarget])

  async function toggleFullscreen() {
    const element = fullscreenTarget ?? frame.current
    if (!element) return
    try {
      if (element.ownerDocument.fullscreenElement === element)
        await element.ownerDocument.exitFullscreen()
      else await element.requestFullscreen()
      editor.current?.requestMeasure()
      editor.current?.focus()
    } catch {
      toast.error(
        'Fullscreen is unavailable in this browser. Allow fullscreen or try another browser.'
      )
    }
  }

  useEffect(() => {
    callback.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: initial.current.value,
        extensions: [
          basicSetup,
          yaml(),
          indentUnit.of('  '),
          EditorState.tabSize.of(2),
          keymap.of([indentWithTab]),
          syntaxHighlighting(colors),
          workflowScalars,
          appearance,
          options.current.of([
            EditorState.readOnly.of(initial.current.readOnly),
            EditorView.editable.of(!initial.current.readOnly),
            EditorView.contentAttributes.of({
              'aria-label': initial.current.label,
              'aria-readonly': String(initial.current.readOnly),
              tabindex: '0',
              spellcheck: 'false',
            }),
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !synchronizing.current)
              callback.current?.(update.state.doc.toString())
            if (update.docChanged || update.selectionSet) {
              const cursor = update.state.selection.main.head
              const line = update.state.doc.lineAt(cursor)
              setPosition({ line: line.number, column: cursor - line.from + 1 })
            }
          }),
        ],
      }),
    })
    editor.current = view
    return () => {
      editor.current = null
      view.destroy()
    }
  }, [])

  useEffect(() => {
    const view = editor.current
    if (!view || view.state.doc.toString() === value) return
    synchronizing.current = true
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
      })
    } finally {
      synchronizing.current = false
    }
  }, [value])

  useEffect(() => {
    editor.current?.dispatch({
      effects: options.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({
          'aria-label': label,
          'aria-readonly': String(readOnly),
          tabindex: '0',
          spellcheck: 'false',
        }),
      ]),
    })
  }, [label, readOnly])

  return (
    <div ref={frame} className='yaml-workflow-editor min-w-0 overflow-hidden'>
      <div ref={host} className='yaml-editor-host min-h-0 min-w-0' />
      <div className='flex shrink-0 flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-3 py-1.5 font-mono text-[11px] text-muted-foreground'>
        <span>
          Ln {position.line}, Col {position.column}
        </span>
        <div className='flex items-center gap-2'>
          <span
            title={
              readOnly
                ? 'Select and copy YAML'
                : 'Tab indents. Press Escape, then Tab to leave the editor.'
            }
          >
            {readOnly ? 'Read only · ' : ''}YAML · 2 spaces
          </span>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-6 gap-1.5 px-1.5 text-[11px]'
            aria-label={
              fullscreen
                ? fullscreenTarget
                  ? 'Exit workflow fullscreen'
                  : 'Exit fullscreen editor'
                : fullscreenTarget
                  ? 'Open workflow fullscreen'
                  : 'Open editor fullscreen'
            }
            aria-pressed={fullscreen}
            title={
              fullscreen
                ? 'Exit fullscreen (Esc)'
                : fullscreenTarget
                  ? 'Open workflow fullscreen'
                  : 'Open editor fullscreen'
            }
            onClick={() => void toggleFullscreen()}
          >
            {fullscreen ? (
              <Minimize2 className='size-3.5' />
            ) : (
              <Maximize2 className='size-3.5' />
            )}
            <span className='hidden sm:inline'>
              {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </span>
          </Button>
        </div>
      </div>
    </div>
  )
}
