import 'reflect-metadata'
import { ForbiddenException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { OrganizationController } from '../src/auth/organization.controller.js'
import type { PrismaService } from '../src/prisma/prisma.service.js'
import type { AuthorizationService } from '../src/auth/authorization.service.js'
import type { AuthService } from '../src/auth/auth.service.js'

type Request = Parameters<OrganizationController['list']>[0]
const request = {
  preflytSession: { identityId: 'user', organizationId: 'one' },
  headers: { origin: 'http://localhost:5173' },
  cookies: { session: 'browser-token' },
} as unknown as Request
function fixture(
  rows: unknown[],
  membership = vi.fn(async () => ({ id: 'member' })),
) {
  const update = vi.fn(async () => ({}))
  const db = {
    organizationMembership: { findMany: vi.fn(async () => rows) },
    webSession: { update },
  }
  const auth = { assertOrigin: vi.fn(), sessionCookieName: 'session' }
  return {
    controller: new OrganizationController(
      db as unknown as PrismaService,
      { membership } as unknown as AuthorizationService,
      auth as unknown as AuthService,
    ),
    update,
    membership,
  }
}
const row = (id: string, login: string | null, accounts: string[] = []) => ({
  organizationId: id,
  role: 'OWNER',
  organization: {
    name: 'Preflyt workspace',
    githubLink: login ? { login } : null,
    installations: accounts.map((accountLogin) => ({ accountLogin })),
  },
})
describe('authorized GitHub organization switching', () => {
  it('uses GitHub names for linked and unambiguous legacy connections across memberships', async () => {
    const { controller } = fixture([
      row('one', 'lyrisoft'),
      row('two', null, ['second-org']),
    ])
    expect((await controller.list(request)).organizations).toEqual([
      { id: 'one', name: 'lyrisoft', githubLogin: 'lyrisoft', role: 'OWNER' },
      {
        id: 'two',
        name: 'second-org',
        githubLogin: 'second-org',
        role: 'OWNER',
      },
    ])
  })
  it('omits revoked memberships and does not invent a GitHub identity for ambiguous legacy workspaces', async () => {
    const membership = vi.fn(async (_identity: string, id: string) => {
      if (id === 'revoked') throw new ForbiddenException()
      return { id: 'member' }
    })
    const { controller } = fixture(
      [row('one', null, ['a', 'b']), row('revoked', 'private-org')],
      membership,
    )
    expect((await controller.list(request)).organizations).toEqual([
      {
        id: 'one',
        name: 'Preflyt workspace',
        githubLogin: null,
        role: 'OWNER',
      },
    ])
  })
  it('changes only the requesting browser session after membership verification', async () => {
    const { controller, update, membership } = fixture([])
    await expect(controller.activate('two', request)).resolves.toEqual({
      organizationId: 'two',
    })
    expect(membership).toHaveBeenCalledWith('user', 'two')
    expect(update).toHaveBeenCalledWith({
      where: { tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) },
      data: { activeOrganizationId: 'two' },
    })
  })
  it('rejects an organization without a membership before changing the session', async () => {
    const { controller, update } = fixture([], vi.fn(async () => null) as never)
    await expect(controller.activate('other', request)).rejects.toThrow(
      'Active organization membership required',
    )
    expect(update).not.toHaveBeenCalled()
  })
})
