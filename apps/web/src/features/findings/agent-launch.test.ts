import { expect, it } from 'vitest'
import { agentLaunchUrl, connectedLaunchAgents } from './agent-launch'

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
    connectedLaunchAgents(
      [connection, { ...connection, clientName: 'Claude Code' }, connection],
      '120'
    ).map((a) => a.id)
  ).toEqual(['codex', 'claude'])
  for (const patch of [
    { revokedAt: '2026-01-01' },
    { expiresAt: '2020-01-01' },
    { repositories: ['other'] },
    { scopes: 'findings:review' },
    { clientName: 'Unknown MCP client' },
  ])
    expect(connectedLaunchAgents([{ ...connection, ...patch }], '120')).toEqual(
      []
    )
})
