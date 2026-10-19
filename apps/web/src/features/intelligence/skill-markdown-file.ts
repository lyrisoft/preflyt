import {
  governanceRequest,
  governanceTextRequest,
} from '../repositories/governance-api'

export const skillLimits = {
  description: 2000,
  instructions: 24000,
  fileBytes: 131072,
} as const

export type SkillDocument = {
  languages?: string[]
  frameworks?: string[]
  name: string
  description: string
  instructions: string
  stages: string[]
  repositories: string[]
  source: string
  license: string
}
export async function readSkillMarkdown(file: File, signal?: AbortSignal) {
  if (!/\.md$/i.test(file.name))
    throw new Error('File: choose a Markdown (.md) file.')
  if (file.size > skillLimits.fileBytes)
    throw new Error(
      `File: maximum 131,072 bytes (128 KiB); received ${file.size.toLocaleString('en-US')}.`
    )
  let markdown: string
  try {
    markdown = new TextDecoder('utf-8', { fatal: true }).decode(
      await file.arrayBuffer()
    )
  } catch {
    throw new Error('Save SKILL.md as UTF-8 text and try again')
  }
  return governanceRequest<SkillDocument>(
    '/ai/skills/parse',
    { markdown },
    signal
  )
}
export async function downloadSkillMarkdown(
  id: string,
  kind: 'organization' | 'builtin' = 'organization'
) {
  const content = await governanceTextRequest(
    `/ai/skills/${kind === 'builtin' ? 'builtins/' : ''}${encodeURIComponent(id)}/markdown`
  )
  const url = URL.createObjectURL(
    new Blob([content], { type: 'text/markdown;charset=utf-8' })
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'SKILL.md'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
