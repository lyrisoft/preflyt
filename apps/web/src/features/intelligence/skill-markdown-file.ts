import {
  governanceRequest,
  governanceTextRequest,
} from '../repositories/governance-api'

export type SkillDocument = {
  name: string
  description: string
  instructions: string
  stages: string[]
  repositories: string[]
  source: string
  license: string
}
export async function readSkillMarkdown(file: File, signal?: AbortSignal) {
  if (!/\.md$/i.test(file.name) || file.size > 32768)
    throw new Error('Choose a Markdown (.md) file no larger than 32 KiB')
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
export async function downloadSkillMarkdown(id: string) {
  const content = await governanceTextRequest(
    `/ai/skills/${encodeURIComponent(id)}/markdown`
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
