import { expect, it } from 'vitest'
import { agentLaunchUrl, connectedMcpAgents } from './agent-launch'

it('uses supported desktop draft links and preserves the prompt without submitting it', () => {
  const prompt = 'Verify & fix?\nMCP scope: {"findingId":"a"}\nUnicode: ✓'
  const codex = new URL(agentLaunchUrl('codex', prompt, 'fixture/repo'))
  expect(codex.protocol).toBe('codex:')
  expect(codex.hostname + codex.pathname).toBe('threads/new')
  expect(codex.searchParams.get('prompt')).toBe(prompt)
  expect(codex.searchParams.get('originUrl')).toBe(
    'https://github.com/fixture/repo.git'
  )
  const claude = new URL(agentLaunchUrl('claude', prompt, 'fixture/repo'))
  expect(claude.protocol).toBe('claude:')
  expect(claude.hostname + claude.pathname).toBe('code/new')
  expect(claude.searchParams.get('q')).toBe(prompt)
  for (const url of [codex, claude])
    expect(url.searchParams.has('submit')).toBe(false)
  expect(
    agentLaunchUrl('codex', prompt, 'https://evil.example/?x=1')
  ).not.toContain('originUrl')
  expect(() =>
    agentLaunchUrl('claude', 'a'.repeat(14000), 'fixture/repo')
  ).toThrow('Copy verification task')
})
it('offers each connected supported agent once and respects repository scope, revocation and expiry', () => {
  const connection = {
    clientName: 'Codex',
    repositories: ['120'],
    scopes: 'findings:read findings:review',
    revokedAt: null,
    expiresAt: '2099-01-01',
  }
  expect(
    connectedMcpAgents(
      [
        connection,
        { ...connection, clientName: 'Claude Code' },
        connection,
        { ...connection, clientName: 'DeepSeek Harness' },
        { ...connection, clientName: 'Custom MCP Agent' },
        { ...connection, clientName: 'custom mcp agent' },
      ],
      '120'
    ).map((a) => a.id)
  ).toEqual(['codex', 'claude', 'deepseek', 'mcp:custom mcp agent'])
  for (const patch of [
    { revokedAt: '2026-01-01' },
    { expiresAt: '2020-01-01' },
  ])
    expect(connectedMcpAgents([{ ...connection, ...patch }], '120')).toEqual([])
})
it('keeps agents with other repository scopes visible and marks their access requirement without granting it', () => {
  const connection = {
    clientName: 'DeepSeek Harness',
    repositories: ['other'],
    scopes: 'findings:read',
    revokedAt: null,
    expiresAt: '2099-01-01',
  }
  expect(connectedMcpAgents([connection], '120')[0]).toMatchObject({
    id: 'deepseek',
    repositoryApproved: false,
  })
  expect(
    connectedMcpAgents(
      [connection, { ...connection, repositories: ['120'] }],
      '120'
    )
  ).toMatchObject([{ id: 'deepseek', repositoryApproved: true }])
  expect(
    connectedMcpAgents(
      [{ ...connection, repositories: ['120'], scopes: 'findings:review' }],
      '120'
    )[0].repositoryApproved
  ).toBe(false)
})
it('keeps every other MCP client visible without inventing a desktop launch protocol', () => {
  const base = {
    repositories: ['120'],
    scopes: 'findings:read',
    revokedAt: null,
    expiresAt: '2099-01-01',
  }
  const agents = connectedMcpAgents(
    [
      { ...base, clientName: 'DeepSeek Harness' },
      { ...base, clientName: 'Unknown MCP client' },
      { ...base, clientName: 'https://untrusted.example' },
    ],
    '120'
  )
  expect(agents).toHaveLength(3)
  expect(agents.every((a) => a.launch === undefined)).toBe(true)
  expect(agents[0]).toMatchObject({
    name: 'DeepSeek Harness',
    logo: 'deepseek',
  })
  expect(agents[1]).toMatchObject({ name: 'Unknown MCP client' })
})
