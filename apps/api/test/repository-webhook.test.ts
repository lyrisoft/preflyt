import 'reflect-metadata'
import { createHmac, randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GitHubWebhookService } from '../src/github-events/github-webhook.service.js'
import type { PrismaService } from '../src/prisma/prisma.service.js'

const secret = 'signed-repository-hook-test-0000000000000000'
const db = {
  gitHubRepository: { findFirst: vi.fn() },
  gitHubWebhookDelivery: { findUnique: vi.fn(), createMany: vi.fn() },
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GITHUB_EVENTS_ENABLED', 'true')
  vi.stubEnv('GITHUB_WEBHOOK_SECRET', secret)
  db.gitHubRepository.findFirst.mockResolvedValue({installationId: 77n, fullName: 'fixture/app', ownerLogin: 'fixture'})
  db.gitHubWebhookDelivery.findUnique.mockResolvedValue(null)
  db.gitHubWebhookDelivery.createMany.mockResolvedValue({count: 1})
})
afterEach(() => vi.unstubAllEnvs())
const payload = () => ({action: 'completed', repository: {id: 501, full_name: 'fixture/app', owner: {login: 'fixture'}},
  workflow_run: {id: 1001, workflow_id: 2001, run_attempt: 1, head_sha: 'a'.repeat(40), status: 'completed', conclusion: 'failure'}})
async function receive(body = payload(), signatureBody = body) {
  const raw = Buffer.from(JSON.stringify(body))
  const signature = 'sha256=' + createHmac('sha256', secret).update(JSON.stringify(signatureBody)).digest('hex')
  return new GitHubWebhookService(db as unknown as PrismaService).receive(raw, signature, randomUUID(), 'workflow_run', body)
}
it('binds a genuinely signed repository event to its selected existing App connection', async () => {
  expect(await receive()).toMatchObject({accepted: true})
  expect(db.gitHubRepository.findFirst).toHaveBeenCalledWith(expect.objectContaining({where: {
    githubId: 501n, selected: true, available: true, installation: {active: true}}}))
  expect(db.gitHubWebhookDelivery.createMany).toHaveBeenCalledWith(expect.objectContaining({data: [expect.objectContaining({
    installationId: 77n, repositoryGithubId: 501n, event: 'workflow_run', sourceConclusion: 'failure'})]}))
})
it('rejects tampering before looking up any connection', async () => {
  const changed = payload(); changed.workflow_run.conclusion = 'success'
  await expect(receive(changed, payload())).rejects.toThrow('signature is invalid')
  expect(db.gitHubRepository.findFirst).not.toHaveBeenCalled()
})
it('does not admit an unselected, unavailable or disconnected repository', async () => {
  db.gitHubRepository.findFirst.mockResolvedValue(null)
  expect(await receive()).toEqual({accepted: false, reason: 'repository_not_selected'})
  expect(db.gitHubWebhookDelivery.createMany).not.toHaveBeenCalled()
})
it('rejects a repository name or owner inconsistent with the connected ID', async () => {
  const changed = payload(); changed.repository.full_name = 'other/app'
  await expect(receive(changed)).rejects.toThrow('does not match its connection')
  expect(db.gitHubWebhookDelivery.createMany).not.toHaveBeenCalled()
})
it('does not repair malformed or explicitly supplied App installation identity', async () => {
  await expect(receive({...payload(), installation: {id: null}} as ReturnType<typeof payload>)).rejects.toThrow('identifier is invalid')
  expect(db.gitHubRepository.findFirst).not.toHaveBeenCalled()
})

it('ignores its own signed readiness feedback without dropping third-party checks', async () => {
  vi.stubEnv('GITHUB_APP_ID', '999')
  const check = (app: number, name: string) => ({ action: 'completed', installation: {id: 77},
    repository: {id: 501}, check_run: {id: 900, name, app: {id: app}, head_sha: 'a'.repeat(40),
      status: 'completed', conclusion: 'failure'} })
  async function send(body: object) {
    const raw = Buffer.from(JSON.stringify(body))
    return new GitHubWebhookService(db as unknown as PrismaService).receive(raw,
      'sha256=' + createHmac('sha256', secret).update(raw).digest('hex'), randomUUID(), 'check_run', body)
  }
  expect(await send(check(999, 'Preflyt / Engineering Readiness'))).toEqual({accepted: false, reason: 'preflyt_feedback_check'})
  expect(await send(check(999, 'Preflyt / AI Review'))).toEqual({accepted: false, reason: 'preflyt_feedback_check'})
  expect(db.gitHubWebhookDelivery.createMany).not.toHaveBeenCalled()
  expect(await send(check(123, 'Preflyt / Engineering Readiness'))).toMatchObject({accepted: true})
  expect(await send(check(999, 'Tests'))).toMatchObject({accepted: true})
})
