/** Separate our publication metadata from the changes, without losing it. */
export function splitReleaseNotes(body: string) {
  // Curated notes place publisher-owned metadata at the end. Keep fenced code
  // intact: a heading-looking line inside a code example is still user content.
  const lines = body.trim().split('\n')
  let fence: { marker: string; length: number } | undefined
  const technical = lines.findIndex((line) => {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (match) {
      if (!fence) fence = { marker: match[1][0], length: match[1].length }
      else if (
        match[1][0] === fence.marker &&
        match[1].length >= fence.length &&
        !match[2].trim()
      )
        fence = undefined
      return false
    }
    return !fence && /^## Technical details\s*$/.test(line)
  })
  if (technical !== -1) {
    return {
      changes: lines.slice(0, technical).join('\n').trim(),
      details: lines
        .slice(technical + 1)
        .join('\n')
        .trim(),
    }
  }
  const blocks = body.trim().split(/\n\s*\n/)
  const details: string[] = []
  if (/^All application images use v\d+\.\d+\.\d+\b/.test(blocks[0] ?? '')) {
    details.push(blocks.shift()!)
    if (
      /^Upgrade guide: https:\/\/docs\.preflytlabs\.com\//.test(blocks[0] ?? '')
    ) {
      details.push(blocks.shift()!)
    }
  }
  return { changes: blocks.join('\n\n'), details: details.join('\n\n') }
}
