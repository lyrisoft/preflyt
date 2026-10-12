import { useEffect, useId, useRef } from 'react'
import { yaml } from '@codemirror/lang-yaml'
import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from '@codemirror/language'
import { java, csharp, cpp, c } from '@codemirror/legacy-modes/mode/clike'
import { go } from '@codemirror/legacy-modes/mode/go'
import {
  javascript,
  typescript,
  json,
} from '@codemirror/legacy-modes/mode/javascript'
import { python } from '@codemirror/legacy-modes/mode/python'
import { ruby } from '@codemirror/legacy-modes/mode/ruby'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { standardSQL } from '@codemirror/legacy-modes/mode/sql'
import { EditorState, RangeSet, type Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  GutterMarker,
  drawSelection,
  gutterLineClass,
  lineNumbers,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import type { FindingSource } from './finding-api'
import { findingCodeTooltip } from './finding-code-tooltip'
import type { Finding } from './finding-types'
import './source-code-editor.css'

const syntax = HighlightStyle.define([
  { tag: tags.keyword, class: 'source-keyword' },
  { tag: [tags.string, tags.special(tags.string)], class: 'source-string' },
  {
    tag: [tags.number, tags.bool, tags.null, tags.atom],
    class: 'source-constant',
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.definition(tags.variableName),
      tags.propertyName,
    ],
    class: 'source-function',
  },
  {
    tag: [tags.typeName, tags.className, tags.standard(tags.variableName)],
    class: 'source-type',
  },
  { tag: tags.comment, class: 'source-comment' },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket],
    class: 'source-punctuation',
  },
  { tag: tags.invalid, class: 'source-invalid' },
])
function languageFor(path: string) {
  const extension = path.split('.').pop()?.toLowerCase()
  const modes = {
    py: ['Python', python],
    js: ['JavaScript', javascript],
    jsx: ['JavaScript', javascript],
    mjs: ['JavaScript', javascript],
    cjs: ['JavaScript', javascript],
    ts: ['TypeScript', typescript],
    tsx: ['TypeScript', typescript],
    json: ['JSON', json],
    java: ['Java', java],
    cs: ['C#', csharp],
    go: ['Go', go],
    rb: ['Ruby', ruby],
    c: ['C', c],
    h: ['C', c],
    cpp: ['C++', cpp],
    hpp: ['C++', cpp],
    sql: ['SQL', standardSQL],
    sh: ['Shell', shell],
    bash: ['Shell', shell],
  } as const
  if (extension === 'yml' || extension === 'yaml')
    return { name: 'YAML', extension: yaml() }
  const mode = modes[extension as keyof typeof modes]
  return mode
    ? { name: mode[0], extension: StreamLanguage.define(mode[1]) }
    : { name: 'Plain text', extension: [] }
}
const appearance = EditorView.theme({
  '&': {
    fontSize: '13px',
    color: 'var(--foreground)',
    backgroundColor: 'var(--source-background)',
  },
  '&.cm-focused': { outline: '2px solid var(--ring)', outlineOffset: '-2px' },
  '.cm-scroller': {
    fontFamily:
      'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    lineHeight: '1.7',
    overflow: 'auto',
    maxHeight: '28rem',
  },
  '.cm-content': { padding: '12px 0', caretColor: 'transparent' },
  '.cm-line': { padding: '0 16px' },
  '.cm-gutters': {
    backgroundColor: 'var(--source-gutter)',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px', minWidth: '44px' },
  '.cm-reported-line, .cm-finding-gutter': {
    backgroundColor: 'var(--source-finding)',
  },
  '.cm-finding-gutter': { color: 'var(--danger-text)', fontWeight: '600' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: 'var(--source-selection)',
  },
})
class FindingGutterMarker extends GutterMarker {
  elementClass = 'cm-finding-gutter'
}
const marker = new FindingGutterMarker()
export function SourceCodeEditor({
  finding,
  lines,
  path,
  reportedLine,
  reportedEndLine,
}: {
  finding?: Finding
  lines: FindingSource['lines']
  path: string
  reportedLine: number | null
  reportedEndLine?: number | null
}) {
  const host = useRef<HTMLDivElement>(null)
  const tooltipId = useId()
  const language = languageFor(path)
  useEffect(() => {
    if (!host.current) return
    const firstLine = lines[0]?.number ?? 1
    const text = lines.map((line) => line.text).join('\n')
    const doc = EditorState.create({ doc: text }).doc
    const decorations: Range<Decoration>[] = [],
      gutters: Range<GutterMarker>[] = []
    lines.forEach((line, index) => {
      if (
        reportedLine === null ||
        line.number < reportedLine ||
        line.number > (reportedEndLine ?? reportedLine)
      )
        return
      decorations.push(
        Decoration.line({
          class: 'cm-reported-line',
          attributes: {
            'data-reported-line': 'true',
            ...(finding
              ? {
                  tabindex: '0',
                  role: 'button',
                  'aria-label': `Show problem and solution for line ${line.number}`,
                  'aria-describedby': tooltipId,
                }
              : {}),
          },
        }).range(doc.line(index + 1).from)
      )
      gutters.push(marker.range(doc.line(index + 1).from))
    })
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: text,
        extensions: [
          EditorState.readOnly.of(true),
          EditorState.tabSize.of(4),
          EditorView.editable.of(false),
          EditorView.contentAttributes.of({
            'aria-label': 'Assessed source code',
            'aria-readonly': 'true',
            role: 'textbox',
            tabindex: '0',
            spellcheck: 'false',
          }),
          lineNumbers({ formatNumber: (n) => String(n + firstLine - 1) }),
          gutterLineClass.of(RangeSet.of(gutters)),
          drawSelection(),
          finding ? findingCodeTooltip(finding, firstLine, tooltipId) : [],
          languageFor(path).extension,
          syntaxHighlighting(syntax),
          appearance,
          EditorView.decorations.of(Decoration.set(decorations)),
        ],
      }),
    })
    return () => view.destroy()
  }, [finding, lines, path, reportedLine, reportedEndLine, tooltipId])
  return (
    <div className='finding-code-editor min-w-0 overflow-hidden'>
      <div ref={host} />
      <div className='flex flex-wrap justify-between gap-2 border-t bg-muted/20 px-4 py-2 text-[11px] text-muted-foreground'>
        <span>{language.name}</span>
        <span>Read only · {lines.length} lines shown</span>
      </div>
    </div>
  )
}
