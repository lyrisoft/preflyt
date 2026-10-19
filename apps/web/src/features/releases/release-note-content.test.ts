import { expect, it } from 'vitest'
import { splitReleaseNotes } from './release-note-content'

it('separates curated build metadata without hiding upgrade instructions', () => {
  const changes =
    "New finding tools.\n\n## What's new\n\n- Connect an agent.\n\n## Improvements and fixes\n\n- Faster saved results.\n\n## Upgrade notes\n\nRun migrations before restarting."
  const details =
    'Images for linux/amd64 and linux/arm64.\n\n<!-- preflyt-release-ready:v1 sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa -->'
  expect(
    splitReleaseNotes(`${changes}\n\n## Technical details\n\n${details}`)
  ).toEqual({ changes, details })
})

it('keeps ordinary notes intact and preserves headings inside fenced examples', () => {
  for (const fence of ['```', '~~~~']) {
    const changes = `## Upgrade notes\n\n${fence}markdown\n## Technical details\nExample text\n${fence}\n\nRestart after migration.`
    expect(splitReleaseNotes(changes)).toEqual({ changes, details: '' })
    expect(
      splitReleaseNotes(`${changes}\n\n## Technical details\n\nBuild tags.`)
    ).toEqual({ changes, details: 'Build tags.' })
  }
  expect(splitReleaseNotes('')).toEqual({ changes: '', details: '' })
})
