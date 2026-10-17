/** Separate our publication metadata from the changes, without losing it. */
export function splitReleaseNotes(body: string) {
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
