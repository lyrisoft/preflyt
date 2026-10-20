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

export type ConnectedMcpAgent = {
  id: string
  name: string
  logo?: CodingAgent | 'deepseek'
  launch?: CodingAgent
  repositoryApproved: boolean
}

export function connectedMcpAgents(
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
    (c) => !c.revokedAt && new Date(c.expiresAt).getTime() > now
  )
  const agents = new Map<string, ConnectedMcpAgent>()
  for (const connection of connected) {
    const displayName =
      connection.clientName.trim().replace(/\s+/g, ' ') || 'MCP agent'
    const name = displayName.toLowerCase().replace(/[ _-]+/g, ' ')
    const native = codingAgents.find((agent) =>
      agent.id === 'codex' ? /\bcodex\b/.test(name) : /\bclaude\b/.test(name)
    )
    const agent: Omit<ConnectedMcpAgent, 'repositoryApproved'> = native
      ? { ...native, logo: native.id, launch: native.id }
      : /\bdeepseek\b|\bdeep seek\b|\bdsh\b/.test(name)
        ? { id: 'deepseek', name: 'DeepSeek Harness', logo: 'deepseek' }
        : { id: `mcp:${name}`, name: displayName }
    const repositoryApproved =
      connection.repositories.includes(repository) &&
      connection.scopes.split(/\s+/).includes('findings:read')
    agents.set(agent.id, {
      ...agent,
      repositoryApproved:
        repositoryApproved || !!agents.get(agent.id)?.repositoryApproved,
    })
  }
  return [...agents.values()]
}
