import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuthorizationService } from "../auth/authorization.service.js";
import type { AuthenticatedSession } from "../auth/session.guard.js";
import { candidates } from "./retention-queries.js";
import { retentionFields, retentionInput } from "./retention-policy.js";

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(AuthorizationService) private readonly access: AuthorizationService,
  ) {}
  private async scope(session: AuthenticatedSession, fresh = false) {
    return (
      await this.access.requireOrganization(
        session,
        "organization.members.manage",
        fresh,
      )
    ).organizationId;
  }
  private async lockMember(
    tx: Prisma.TransactionClient,
    session: AuthenticatedSession,
    organizationId: string,
  ) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM "OrganizationMembership" WHERE "organizationId"=${organizationId} AND "identityId"=${session.identityId} AND active=true AND role IN ('OWNER','ADMIN') FOR SHARE`,
    );
    if (!rows.length)
      throw new ForbiddenException(
        "An active workspace Owner or Admin is required to change retention.",
      );
  }
  private state(organizationId: string) {
    return this.db.workspaceRetention.upsert({
      where: { organizationId },
      create: { organizationId },
      update: {},
    });
  }
  private view(row: Awaited<ReturnType<RetentionService["state"]>>) {
    return {
      organizationId: row.organizationId,
      revision: row.revision,
      enabled: row.enabled,
      ...Object.fromEntries(retentionFields.map((key) => [key, row[key]])),
      lastRunAt: row.lastRunAt,
      lastResult: row.lastResult,
      lastError: row.lastError,
      nextRunAt: row.enabled ? row.nextRunAt : null,
      workerEnabled: process.env.RETENTION_CLEANUP_ENABLED !== "false",
      running: !!row.leaseUntil && row.leaseUntil > new Date(),
    };
  }
  async get(session: AuthenticatedSession) {
    return this.view(await this.state(await this.scope(session)));
  }
  async preview(session: AuthenticatedSession, input: unknown) {
    const organizationId = await this.scope(session),
      body = retentionInput(input),
      current = await this.state(organizationId);
    if (current.revision !== body.revision)
      throw new ConflictException(
        "Retention settings changed. Reload before previewing cleanup.",
      );
    const asOf = new Date(),
      items = [];
    for (const kind of retentionFields) {
      const cutoff = new Date(asOf.getTime() - body[kind] * 86400000),
        query = candidates(kind, organizationId, cutoff);
      const [count] = await this.db.$queryRaw<{ count: bigint }[]>(
        Prisma.sql`SELECT COUNT(*) AS count FROM (${query.sql}) eligible`,
      );
      items.push({
        kind,
        cutoff: cutoff.toISOString(),
        eligible: Number(count.count),
      });
    }
    return { asOf: asOf.toISOString(), revision: current.revision, items };
  }
  async save(session: AuthenticatedSession, input: unknown) {
    const organizationId = await this.scope(session, true),
      body = retentionInput(input);
    await this.state(organizationId);
    await this.db.$transaction(async (tx) => {
      await this.lockMember(tx, session, organizationId);
      const now = new Date();
      const changed = await tx.workspaceRetention.updateMany({
        where: {
          organizationId,
          revision: body.revision,
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        data: {
          enabled: body.enabled,
          ...Object.fromEntries(retentionFields.map((key) => [key, body[key]])),
          revision: { increment: 1 },
          updatedById: session.identityId,
          nextRunAt: now,
        },
      });
      if (!changed.count)
        throw new ConflictException(
          "Retention settings changed or cleanup is running. Reload and try again.",
        );
      await tx.auditEvent.create({
        data: {
          actorId: session.identityId,
          event: "retention.settings_updated",
          metadata: {
            organizationId,
            enabled: body.enabled,
            periods: Object.fromEntries(
              retentionFields.map((key) => [key, body[key]]),
            ),
          },
        },
      });
    });
    return this.get(session);
  }
  async requestCleanup(session: AuthenticatedSession, revision: unknown) {
    const organizationId = await this.scope(session, true);
    if (!Number.isSafeInteger(revision))
      throw new ConflictException(
        "Reload retention settings before starting cleanup.",
      );
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await this.lockMember(tx, session, organizationId);
      const queued = await tx.workspaceRetention.updateMany({
        where: {
          organizationId,
          enabled: true,
          revision: Number(revision),
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        data: { nextRunAt: now },
      });
      if (!queued.count)
        throw new ConflictException(
          "Enable cleanup and save settings first, or wait for the current cleanup to finish.",
        );
      await tx.auditEvent.create({
        data: {
          actorId: session.identityId,
          event: "retention.cleanup_requested",
          metadata: { organizationId },
        },
      });
    });
    return { queued: true };
  }
  async reconcile() {
    if (process.env.RETENTION_CLEANUP_ENABLED === "false") return;
    const now = new Date(),
      batch = Math.min(
        1000,
        Math.max(
          10,
          Math.floor(Number(process.env.RETENTION_CLEANUP_BATCH) || 250),
        ),
      );
    const rows = await this.db.workspaceRetention.findMany({
      where: {
        enabled: true,
        nextRunAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      orderBy: { nextRunAt: "asc" },
      take: 5,
    });
    for (const row of rows) {
      const leaseToken = randomUUID(),
        leaseUntil = new Date(Date.now() + 120000),
        where = {
          organizationId: row.organizationId,
          leaseToken,
          revision: row.revision,
        };
      const claim = await this.db.workspaceRetention.updateMany({
        where: {
          organizationId: row.organizationId,
          enabled: true,
          revision: row.revision,
          nextRunAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        data: { leaseToken, leaseUntil },
      });
      if (!claim.count) continue;
      try {
        const result: Record<string, number> = {};
        for (const kind of retentionFields) {
          const cutoff = new Date(now.getTime() - row[kind] * 86400000),
            query = candidates(kind, row.organizationId, cutoff);
          result[kind] = await this.db.$transaction(
            async (tx) => {
              const held = await tx.workspaceRetention.updateMany({
                where: {
                  ...where,
                  enabled: true,
                  leaseUntil: { gt: new Date() },
                },
                data: { leaseUntil: new Date(Date.now() + 120000) },
              });
              if (!held.count)
                throw new ForbiddenException("Cleanup ownership changed");
              const count = await tx.$executeRaw(
                Prisma.sql`DELETE FROM ${Prisma.raw('"' + query.table + '"')} WHERE id IN (SELECT id FROM (${query.sql}) eligible ORDER BY id LIMIT ${batch})`,
              );
              if (count)
                await tx.auditEvent.create({
                  data: {
                    event: "retention.cleanup_batch",
                    metadata: {
                      organizationId: row.organizationId,
                      category: kind,
                      deleted: count,
                      revision: row.revision,
                    },
                  },
                });
              return count;
            },
            { isolationLevel: "Serializable", timeout: 30000 },
          );
        }
        await this.db.$transaction(async (tx) => {
          const finished = await tx.workspaceRetention.updateMany({
            where: { ...where, leaseUntil: { gt: new Date() } },
            data: {
              leaseToken: null,
              leaseUntil: null,
              lastRunAt: new Date(),
              lastResult: result,
              lastError: false,
              nextRunAt: new Date(
                Date.now() +
                  (Object.values(result).some((n) => n === batch)
                    ? 60000
                    : 3600000),
              ),
            },
          });
          if (finished.count)
            await tx.auditEvent.create({
              data: {
                event: "retention.cleanup_completed",
                metadata: {
                  organizationId: row.organizationId,
                  deleted: result,
                  revision: row.revision,
                },
              },
            });
        });
      } catch {
        this.logger.warn({
          event: "retention.cleanup_failed",
          organizationId: row.organizationId,
        });
        await this.db.workspaceRetention.updateMany({
          where,
          data: {
            leaseToken: null,
            leaseUntil: null,
            lastError: true,
            nextRunAt: new Date(Date.now() + 300000),
          },
        });
      }
    }
  }
}
