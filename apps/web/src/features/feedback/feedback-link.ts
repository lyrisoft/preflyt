export type FeedbackKind = 'bug' | 'suggestion'
export type FeedbackDraft = { title: string; details: string; outcome: string }

/** Only explicit draft fields and the installed version leave the app. */
export function feedbackLink(
  kind: FeedbackKind,
  draft: FeedbackDraft,
  version: string
) {
  const url = new URL('https://github.com/lyrisoft/preflyt/issues/new')
  url.searchParams.set(
    'template',
    kind === 'bug' ? 'bug_report.yml' : 'feature_request.yml'
  )
  url.searchParams.set(
    'title',
    `${kind === 'bug' ? '[Bug]' : '[Feature]'}: ${draft.title.trim()}`
  )
  if (kind === 'bug') {
    url.searchParams.set('versions', version)
    url.searchParams.set('reproduce', draft.details.trim())
    url.searchParams.set('expected', draft.outcome.trim())
  } else {
    url.searchParams.set('problem', draft.details.trim())
    url.searchParams.set('outcome', draft.outcome.trim())
    url.searchParams.set('alternatives', `Preflyt version: ${version}`)
  }
  return url.toString()
}
