export const codingAgents = [
  { id: 'codex', name: 'Codex' },
  { id: 'claude', name: 'Claude Code' },
] as const
export type CodingAgent = (typeof codingAgents)[number]['id']

// Only explicitly supported desktop protocols; never use a client-supplied URL
// scheme or put access tokens, source excerpts or saved reasoning in the link.
export function agentLaunchUrl(
  agent: CodingAgent,
  prompt: string,
  repository: string
) {
  if (!prompt || prompt.length > 12000)
    throw new Error(
      'The launch task is too long. Use Copy verification task instead.'
    )
  if (agent === 'claude')
    return `claude://code/new?q=${encodeURIComponent(prompt)}`
  const remote = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)
    ? `&originUrl=${encodeURIComponent(`https://github.com/${repository}.git`)}`
    : ''
  return `codex://threads/new?prompt=${encodeURIComponent(prompt)}${remote}`
}

export function connectedLaunchAgents(
  connections: {
    clientName: string
    repositories: string[]
    revokedAt: string | null
    expiresAt: string
    scopes: string
  }[],
  repository: string,
  now = Date.now()
) {
  const connected = connections.filter(
    (c) =>
      !c.revokedAt &&
      new Date(c.expiresAt).getTime() > now &&
      c.repositories.includes(repository) &&
      c.scopes.split(' ').includes('findings:read')
  )
  return codingAgents.filter((agent) =>
    connected.some((c) => {
      const name = c.clientName
        .toLowerCase()
        .replace(/[ _-]+/g, ' ')
        .trim()
      return agent.id === 'codex'
        ? /\bcodex\b/.test(name)
        : /\bclaude\b/.test(name)
    })
  )
}
